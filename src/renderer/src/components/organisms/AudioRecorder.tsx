import { useEffect, useRef, useState } from "react";
import type {
  AudioFileSelection,
  RecordingState,
  TranscriptionJobState
} from "../../../../shared/apiTypes";
import { Button } from "../atoms/Button";

const MIME_TYPE_CANDIDATES = [
  "audio/wav",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg"
];
const METER_BAR_COUNT = 20;

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function chooseMimeType(): string {
  return (
    MIME_TYPE_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ??
    ""
  );
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function AudioRecorder(props: {
  disabled: boolean;
  transcriptionState?: TranscriptionJobState;
  onStateChange: (state: RecordingState) => void;
  onTranscribe: (selection: AudioFileSelection) => Promise<void>;
  onLogsChanged: () => void;
}) {
  const [state, setState] = useState<RecordingState>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState<AudioFileSelection | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptionStartedRef = useRef(false);

  useEffect(() => {
    props.onStateChange(state);
  }, [props.onStateChange, state]);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => {
      setDurationMs(Date.now() - startedAtRef.current);
    }, 200);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "transcribing" || !props.transcriptionState) return;
    if (["queued", "converting", "transcribing", "paused"].includes(props.transcriptionState)) {
      transcriptionStartedRef.current = true;
      return;
    }
    if (
      transcriptionStartedRef.current &&
      ["completed", "stopped", "error"].includes(props.transcriptionState)
    ) {
      transcriptionStartedRef.current = false;
      setState(props.transcriptionState === "error" ? "error" : "idle");
      setStatusMessage(
        props.transcriptionState === "completed"
          ? "Recording transcription completed."
          : "Recording transcription stopped."
      );
    }
  }, [props.transcriptionState, state]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      stopStream(streamRef.current);
      void audioContextRef.current?.close();
    },
    []
  );

  function stopMeter(): void {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setLevel(0);
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }

  function startMeter(stream: MediaStream): void {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    audioContextRef.current = audioContext;

    const update = () => {
      analyser.getByteFrequencyData(samples);
      let total = 0;
      for (const sample of samples) total += sample;
      setLevel(Math.min(1, total / samples.length / 110));
      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }

  async function report(
    event: Parameters<typeof window.localStudio.audio.reportRecordingEvent>[0]
  ): Promise<void> {
    await window.localStudio.audio.reportRecordingEvent(event).catch(() => undefined);
    props.onLogsChanged();
  }

  async function startRecording(): Promise<void> {
    setState("requesting-permission");
    setErrorMessage("");
    setStatusMessage("");
    setRecording(null);
    setDurationMs(0);
    chunksRef.current = [];

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone recording is unavailable in this environment.");
      }
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions
          .query({ name: "microphone" as PermissionName })
          .catch(() => null);
        if (permission?.state === "denied") {
          throw new DOMException("Microphone permission is blocked.", "NotAllowedError");
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        },
        video: false
      });
      const mimeType = chooseMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        const message =
          event instanceof ErrorEvent ? event.message : "The recorder reported an error.";
        setErrorMessage(message);
        setState("error");
        void report({ event: "error", message });
      };
      recorder.onstop = () => {
        void finalizeRecording(recorder.mimeType || mimeType);
      };

      await report({ event: "permission-granted" });
      recorder.start(250);
      startedAtRef.current = Date.now();
      startMeter(stream);
      setState("recording");
      await report({ event: "started", mimeType: recorder.mimeType || mimeType });
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
      stopMeter();
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
      const message = denied
        ? "Microphone access was denied. Enable it in system privacy settings and try again."
        : error instanceof Error
          ? error.message
          : String(error);
      setErrorMessage(message);
      setState("error");
      await report({
        event: denied ? "permission-denied" : "error",
        message
      });
    }
  }

  async function finalizeRecording(mimeType: string): Promise<void> {
    const finalDuration = Math.max(durationMs, Date.now() - startedAtRef.current);
    stopStream(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    stopMeter();

    try {
      const blob = new Blob(chunksRef.current, {
        type: mimeType || chunksRef.current[0]?.type || "audio/webm"
      });
      const data = new Uint8Array(await blob.arrayBuffer());
      const saved = await window.localStudio.audio.saveRecording({
        data,
        mimeType: blob.type || "audio/webm",
        durationMs: finalDuration
      });
      setRecording(saved);
      setDurationMs(finalDuration);
      setState("recorded");
      setStatusMessage(`Saved locally: ${saved.path}`);
      await report({
        event: "stopped",
        mimeType: blob.type,
        durationMs: finalDuration
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setState("error");
      await report({ event: "error", message });
    } finally {
      chunksRef.current = [];
    }
  }

  function stopRecording(): void {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setState("stopping");
    setDurationMs(Date.now() - startedAtRef.current);
    recorder.stop();
  }

  async function transcribeNow(): Promise<void> {
    if (!recording) return;
    transcriptionStartedRef.current = false;
    setState("transcribing");
    setErrorMessage("");
    try {
      await window.localStudio.audio.keepRecording(recording.path);
      await report({ event: "transcribe-requested", durationMs });
      await props.onTranscribe(recording);
      setStatusMessage(`Transcribing locally: ${recording.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setState("error");
    }
  }

  async function saveOnly(): Promise<void> {
    if (!recording) return;
    try {
      await window.localStudio.audio.keepRecording(recording.path);
      setStatusMessage(`Recording saved locally: ${recording.path}`);
      setRecording(null);
      setState("idle");
      props.onLogsChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setState("error");
    }
  }

  async function discard(): Promise<void> {
    if (!recording) return;
    try {
      await window.localStudio.audio.discardRecording(recording.path);
      setRecording(null);
      setDurationMs(0);
      setStatusMessage("Recording discarded.");
      setState("idle");
      props.onLogsChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setState("error");
    }
  }

  const busy = [
    "requesting-permission",
    "recording",
    "stopping",
    "recorded",
    "transcribing"
  ].includes(state);

  return (
    <div className={`audio-recorder audio-recorder--${state}`}>
      <div className="audio-recorder__summary">
        <span className="audio-recorder__microphone" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <rect x="8" y="3" width="8" height="12" rx="4" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
          </svg>
        </span>
        <div>
          <strong>Record from microphone</strong>
          <small>
            {state === "recording"
              ? "Recording locally"
              : state === "requesting-permission"
                ? "Checking microphone permission"
                : state === "stopping"
                  ? "Saving recording"
                  : state === "transcribing"
                    ? "Using the normal transcription pipeline"
                    : "Capture audio without leaving the studio"}
          </small>
        </div>
      </div>

      <div
        className="audio-recorder__meter"
        role="meter"
        aria-label="Microphone input level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
      >
        {Array.from({ length: METER_BAR_COUNT }, (_, index) => {
          const shape = 0.35 + ((index * 7) % 10) / 15;
          return (
            <span
              key={index}
              style={{
                transform: `scaleY(${Math.max(0.12, level * shape)})`
              }}
            />
          );
        })}
      </div>

      <span className="audio-recorder__timer" aria-label="Recording duration">
        {formatDuration(durationMs)}
      </span>

      {state === "recording" ? (
        <Button variant="danger" onClick={stopRecording}>
          Stop
        </Button>
      ) : (
        <Button
          onClick={() => void startRecording()}
          disabled={props.disabled || busy}
        >
          Record audio
        </Button>
      )}

      {statusMessage && (
        <p className="audio-recorder__status" role="status">
          {statusMessage}
        </p>
      )}
      {errorMessage && (
        <p className="audio-recorder__error" role="alert">
          {errorMessage}
        </p>
      )}

      {state === "recorded" && recording && (
        <div
          className="recording-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recording-dialog-title"
          aria-describedby="recording-dialog-message"
        >
          <div className="recording-dialog__backdrop" />
          <div className="recording-dialog__content">
            <h2 id="recording-dialog-title">Transcribe this recording?</h2>
            <p id="recording-dialog-message">
              Your recording is saved locally. Do you want to transcribe it now?
            </p>
            <code>{recording.path}</code>
            <div className="recording-dialog__actions">
              <Button autoFocus onClick={() => void transcribeNow()}>
                Transcribe now
              </Button>
              <Button variant="secondary" onClick={() => void saveOnly()}>
                Save only
              </Button>
              <Button variant="danger" onClick={() => void discard()}>
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
