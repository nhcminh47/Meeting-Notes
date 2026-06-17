import { useEffect, useRef, useState } from "react";
import type {
  LiveTranscriptStatus,
  TranscriptionResult
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
export const LIVE_SEGMENT_MS = 3000;

export type LiveTranscriptState =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "transcribing"
  | "catching-up"
  | "stopping"
  | "finalized"
  | "error";

export type LiveTranscriptAction =
  | { type: "request-permission" }
  | { type: "start-listening" }
  | { type: "chunk-started"; queueDepth: number }
  | { type: "chunk-appended"; queueDepth: number }
  | { type: "waiting-for-speech"; queueDepth: number }
  | { type: "stop" }
  | { type: "finalized" }
  | { type: "error" }
  | { type: "reset" };

export function liveTranscriptReducer(
  _state: LiveTranscriptState,
  action: LiveTranscriptAction
): LiveTranscriptState {
  switch (action.type) {
    case "request-permission":
      return "requesting-permission";
    case "start-listening":
      return "listening";
    case "chunk-started":
      return action.queueDepth > 1 ? "catching-up" : "transcribing";
    case "chunk-appended":
    case "waiting-for-speech":
      return action.queueDepth > 0 ? "catching-up" : "listening";
    case "stop":
      return "stopping";
    case "finalized":
      return "finalized";
    case "error":
      return "error";
    case "reset":
      return "idle";
  }
}

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

function appendDeduped(existing: string, incoming: string): string {
  const next = incoming.trim();
  if (!next) return existing;
  const current = existing.trim();
  if (!current) return next;
  const maxOverlap = Math.min(current.length, next.length, 240);
  for (let length = maxOverlap; length >= 12; length -= 1) {
    if (current.slice(-length).toLowerCase() === next.slice(0, length).toLowerCase()) {
      return `${current}${next.slice(length)}`.trim();
    }
  }
  if (current.toLowerCase().endsWith(next.toLowerCase())) return current;
  return `${current}\n${next}`.trim();
}

function statusLabel(status: LiveTranscriptStatus, queueDepth: number): string {
  if (queueDepth > 1) return "catching up";
  return status;
}

export function LiveTranscriptRecorder(props: {
  disabled: boolean;
  model: "small" | "medium";
  language: "vi" | "en" | "auto";
  cpuThreads: number;
  debugMode: boolean;
  onFinalized: (result: TranscriptionResult) => void;
  onStateChange: (state: LiveTranscriptState) => void;
  onLogsChanged: () => void;
}) {
  const [state, setState] = useState<LiveTranscriptState>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [chunkStatus, setChunkStatus] = useState<LiveTranscriptStatus>("listening");
  const [queueDepth, setQueueDepth] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const sessionIdRef = useRef("");
  const chunkIndexRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const transcriptRef = useRef("");
  const segmentChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("");
  const stoppedRef = useRef(false);
  const listeningRef = useRef(false);
  const queueDepthRef = useRef(0);

  function dispatch(action: LiveTranscriptAction): void {
    setState((current) => liveTranscriptReducer(current, action));
  }

  useEffect(() => {
    props.onStateChange(state);
  }, [props.onStateChange, state]);

  useEffect(() => {
    if (!["listening", "transcribing", "catching-up"].includes(state)) return;
    const timer = window.setInterval(() => {
      setDurationMs(Date.now() - startedAtRef.current);
    }, 200);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(
    () => () => {
      stoppedRef.current = true;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (segmentTimerRef.current !== null) {
        window.clearTimeout(segmentTimerRef.current);
      }
      stopStream(streamRef.current);
      void audioContextRef.current?.close();
      if (sessionIdRef.current) {
        window.localStudio.liveTranscript
          .cancelSession(sessionIdRef.current)
          .catch(() => undefined);
      }
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

  function clearSegmentTimer(): void {
    if (segmentTimerRef.current !== null) {
      window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
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
      const nextLevel = Math.min(1, total / samples.length / 110);
      setLevel(nextLevel);
      if (nextLevel < 0.03 && listeningRef.current) {
        setChunkStatus("waiting for speech");
      }
      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }

  async function stopLiveAfterFatalError(message: string): Promise<void> {
    stoppedRef.current = true;
    listeningRef.current = false;
    clearSegmentTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    stopMeter();
    segmentChunksRef.current = [];
    queueDepthRef.current = 0;
    setQueueDepth(0);
    setErrorMessage(message);
    setChunkStatus("error");
    dispatch({ type: "error" });
    if (sessionIdRef.current) {
      await window.localStudio.liveTranscript
        .cancelSession(sessionIdRef.current)
        .catch(() => undefined);
      sessionIdRef.current = "";
    }
    props.onLogsChanged();
  }

  async function enqueueChunk(blob: Blob, isFinal = false): Promise<void> {
    const sessionId = sessionIdRef.current;
    if (!sessionId || blob.size === 0) return;
    const chunkIndex = chunkIndexRef.current;
    chunkIndexRef.current += 1;
    const pendingDepth = queueDepthRef.current + 1;
    queueDepthRef.current = pendingDepth;
    setQueueDepth(pendingDepth);
    setChunkStatus(pendingDepth > 1 ? "catching up" : "transcribing chunk");
    dispatch({ type: "chunk-started", queueDepth: pendingDepth });
    const task = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        const data = new Uint8Array(await blob.arrayBuffer());
        const result = await window.localStudio.liveTranscript.enqueueChunk({
          sessionId,
          chunkIndex,
          data,
          mimeType: blob.type || recorderRef.current?.mimeType || "audio/webm",
          durationMs: LIVE_SEGMENT_MS,
          isFinal
        });
        transcriptRef.current = appendDeduped(transcriptRef.current, result.text);
        setTranscript(transcriptRef.current);
        queueDepthRef.current = result.queueDepth;
        setQueueDepth(result.queueDepth);
        setChunkStatus(result.status);
        dispatch({
          type: result.text ? "chunk-appended" : "waiting-for-speech",
          queueDepth: result.queueDepth
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        void stopLiveAfterFatalError(message);
      });
    queueRef.current = task;
    await task;
  }

  function startSegmentRecorder(stream: MediaStream): void {
    segmentChunksRef.current = [];
    const mimeType = mimeTypeRef.current;
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) segmentChunksRef.current.push(event.data);
    };
    recorder.onerror = (event) => {
      const message =
        event instanceof ErrorEvent ? event.message : "The live recorder reported an error.";
      setErrorMessage(message);
      setChunkStatus("error");
      dispatch({ type: "error" });
    };
    recorder.onstop = () => {
      void handleSegmentStopped(recorder.mimeType || mimeType);
    };
    recorder.start();
    clearSegmentTimer();
    segmentTimerRef.current = window.setTimeout(() => {
      if (!stoppedRef.current && recorder.state === "recording") recorder.stop();
    }, LIVE_SEGMENT_MS);
  }

  async function handleSegmentStopped(mimeType: string): Promise<void> {
    clearSegmentTimer();
    const chunks = segmentChunksRef.current;
    segmentChunksRef.current = [];
    const blob = chunks.length
      ? new Blob(chunks, { type: mimeType || chunks[0]?.type || "audio/webm" })
      : null;
    const enqueuePromise = blob ? enqueueChunk(blob, stoppedRef.current) : Promise.resolve();

    if (stoppedRef.current) {
      await enqueuePromise;
      await finalizeLive();
      return;
    }

    const stream = streamRef.current;
    if (stream) startSegmentRecorder(stream);
  }

  async function startLive(): Promise<void> {
    dispatch({ type: "request-permission" });
    setErrorMessage("");
    setStatusMessage("");
    setTranscript("");
    transcriptRef.current = "";
    setDurationMs(0);
    setQueueDepth(0);
    queueDepthRef.current = 0;
    chunkIndexRef.current = 0;
    stoppedRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone recording is unavailable in this environment.");
      }
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not supported in this environment.");
      }
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions
          .query({ name: "microphone" as PermissionName })
          .catch(() => null);
        if (permission?.state === "denied") {
          throw new DOMException("Microphone permission is blocked.", "NotAllowedError");
        }
      }

      const session = await window.localStudio.liveTranscript.startSession({
        model: props.model,
        language: props.language,
        cpuThreads: props.cpuThreads,
        debugMode: props.debugMode
      });
      sessionIdRef.current = session.sessionId;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        },
        video: false
      });
      const mimeType = chooseMimeType();
      mimeTypeRef.current = mimeType;
      streamRef.current = stream;

      startedAtRef.current = Date.now();
      startSegmentRecorder(stream);
      startMeter(stream);
      listeningRef.current = true;
      setChunkStatus("listening");
      dispatch({ type: "start-listening" });
      setStatusMessage("Listening locally.");
      props.onLogsChanged();
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
      setChunkStatus("error");
      dispatch({ type: "error" });
      if (sessionIdRef.current) {
        await window.localStudio.liveTranscript
          .cancelSession(sessionIdRef.current)
          .catch(() => undefined);
        sessionIdRef.current = "";
      }
      props.onLogsChanged();
    }
  }

  function stopLive(): void {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    stoppedRef.current = true;
    listeningRef.current = false;
    clearSegmentTimer();
    setDurationMs(Date.now() - startedAtRef.current);
    setChunkStatus("stopping");
    dispatch({ type: "stop" });
    recorder.stop();
  }

  async function finalizeLive(): Promise<void> {
    stopStream(streamRef.current);
    listeningRef.current = false;
    streamRef.current = null;
    recorderRef.current = null;
    stopMeter();
    try {
      await queueRef.current;
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const result = await window.localStudio.liveTranscript.finishSession({
        sessionId,
        finalText: transcriptRef.current,
        saveTranscript: true
      });
      sessionIdRef.current = "";
      setStatusMessage(
        result.outputFiles[0]
          ? `Finalized and saved locally: ${result.outputFiles[0]}`
          : "Finalized live transcript."
      );
      props.onFinalized({ text: result.text, outputFiles: result.outputFiles });
      dispatch({ type: "finalized" });
      props.onLogsChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setChunkStatus("error");
      dispatch({ type: "error" });
    }
  }

  const active = ["listening", "transcribing", "catching-up"].includes(state);
  const busy = ["requesting-permission", "stopping"].includes(state) || active;

  return (
    <div className={`live-transcript live-transcript--${state}`}>
      <div className="live-transcript__controls">
        <div className="live-transcript__summary">
          <span className="live-transcript__indicator" aria-hidden="true" />
          <div>
            <strong>Live transcript</strong>
            <small>{active ? "Keeping audio local while catching phrases" : "Chunked local transcription"}</small>
          </div>
        </div>
        <span className="live-transcript__timer" aria-label="Live recording duration">
          {formatDuration(durationMs)}
        </span>
        {active || state === "stopping" ? (
          <Button variant="danger" onClick={stopLive} disabled={state === "stopping"}>
            Stop live
          </Button>
        ) : (
          <Button onClick={() => void startLive()} disabled={props.disabled || busy}>
            Start live
          </Button>
        )}
      </div>

      <div
        className="live-transcript__meter"
        role="meter"
        aria-label="Live microphone input level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
      >
        {Array.from({ length: METER_BAR_COUNT }, (_, index) => {
          const shape = 0.35 + ((index * 7) % 10) / 15;
          return (
            <span
              key={index}
              style={{ transform: `scaleY(${Math.max(0.12, level * shape)})` }}
            />
          );
        })}
      </div>

      <div className="live-transcript__status" role="status" aria-live="polite">
        <span>{statusLabel(chunkStatus, queueDepth)}</span>
        <small>{queueDepth > 0 ? `${queueDepth} chunk${queueDepth === 1 ? "" : "s"} queued` : "queue clear"}</small>
      </div>

      <div className="live-transcript__panel" tabIndex={0} aria-label="Live transcript text">
        {transcript || "Live transcript text will appear here while you speak."}
      </div>

      {statusMessage && <p className="live-transcript__message">{statusMessage}</p>}
      {errorMessage && (
        <p className="live-transcript__error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
