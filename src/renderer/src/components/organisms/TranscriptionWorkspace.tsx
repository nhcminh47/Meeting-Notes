import type { ReactNode } from "react";
import type {
  AudioFileSelection,
  RecordingState,
  TranscriptionJobStatus
} from "../../../../shared/apiTypes";
import { Button } from "../atoms/Button";
import { SelectField } from "../atoms/SelectField";
import { FilePicker } from "../molecules/FilePicker";
import { JobStatus } from "../molecules/JobStatus";
import { AudioRecorder } from "./AudioRecorder";
import musicNoteIcon from "../../assets/icons/music-note.png";

function ControlIcon(props: {
  children: ReactNode;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      aria-hidden={props["aria-hidden"] ?? true}
    >
      {props.children}
    </svg>
  );
}

function ModelIcon(props: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <ControlIcon {...props}>
      <path d="M5 5h14v14H5zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3" />
    </ControlIcon>
  );
}

function LanguageIcon(props: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <ControlIcon {...props}>
      <path d="M4 5h10M9 3v2m-3 4c1.2 2.5 3.3 4.6 6 6m1-7c-1.1 3.5-3.4 6.6-7 9m9-2h5m-2.5-4L21 21m-7 0 3.5-10" />
    </ControlIcon>
  );
}

function OutputIcon(props: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <ControlIcon {...props}>
      <path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6m-6 4h6" />
    </ControlIcon>
  );
}

function CpuIcon(props: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <ControlIcon {...props}>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3m-10-2 2-4 2 4" />
    </ControlIcon>
  );
}

export function TranscriptionWorkspace(props: {
  requiredReady: boolean;
  mediumReady: boolean;
  busy: boolean;
  selection: AudioFileSelection | null;
  model: "small" | "medium";
  language: "vi" | "en" | "auto";
  format: "txt" | "json" | "srt";
  cpuThreads: number;
  logicalCpuCount: number;
  job: TranscriptionJobStatus | null;
  jobRunning: boolean;
  recordingState: RecordingState;
  onPickFile: () => void;
  onRecordingStateChange: (state: RecordingState) => void;
  onTranscribeRecording: (selection: AudioFileSelection) => Promise<void>;
  onLogsChanged: () => void;
  onModelChange: (value: "small" | "medium") => void;
  onLanguageChange: (value: "vi" | "en" | "auto") => void;
  onFormatChange: (value: "txt" | "json" | "srt") => void;
  onCpuChange: (value: number) => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  const recordingBusy = !["idle", "error"].includes(props.recordingState);
  const controlsLocked =
    !props.requiredReady || props.busy || props.jobRunning || recordingBusy;
  const paused = props.job?.state === "paused";
  const balancedCpuCount = Math.max(1, Math.ceil(props.logicalCpuCount * 0.5));
  const highCpuCount = Math.max(1, Math.ceil(props.logicalCpuCount * 0.75));
  const cpuOptions = [
    { value: props.logicalCpuCount, label: `Auto (${props.logicalCpuCount})` },
    { value: highCpuCount, label: `High (${highCpuCount})` },
    { value: balancedCpuCount, label: `Balanced (${balancedCpuCount})` }
  ].filter(
    (option, index, options) =>
      options.findIndex((candidate) => candidate.value === option.value) === index
  ).reverse();

  return (
    <section
      className={`panel transcription-workspace ${
        !props.requiredReady ? "transcription-workspace--disabled" : ""
      }`}
    >
      {!props.requiredReady && (
        <div className="blocked-message">
          Install the required runtime to enable transcription.
        </div>
      )}
      <FilePicker
        fileName={props.selection?.name}
        disabled={
          !props.requiredReady ||
          props.busy ||
          Boolean(props.job?.canStop) ||
          recordingBusy
        }
        onPick={props.onPickFile}
      />
      <AudioRecorder
        disabled={!props.requiredReady || props.busy || Boolean(props.job?.canStop)}
        transcriptionState={props.job?.state}
        onStateChange={props.onRecordingStateChange}
        onTranscribe={props.onTranscribeRecording}
        onLogsChanged={props.onLogsChanged}
      />
      <div className="control-grid">
        <SelectField
          label="Model"
          Icon={ModelIcon}
          value={props.model}
          options={[
            { value: "small", label: "Small" },
            {
              value: "medium",
              label: `Medium ${!props.mediumReady ? "(not installed)" : ""}`.trim(),
              disabled: !props.mediumReady
            }
          ]}
          onChange={(value) => props.onModelChange(value as "small" | "medium")}
          disabled={controlsLocked || paused}
        />
        <SelectField
          label="Language"
          Icon={LanguageIcon}
          value={props.language}
          options={[
            { value: "vi", label: "Vietnamese" },
            { value: "en", label: "English" },
            { value: "auto", label: "Auto detect" }
          ]}
          onChange={(value) => props.onLanguageChange(value as "vi" | "en" | "auto")}
          disabled={controlsLocked || paused}
        />
        <SelectField
          label="Output"
          Icon={OutputIcon}
          value={props.format}
          options={[
            { value: "txt", label: "Text (.txt)" },
            { value: "json", label: "JSON (.json)" },
            { value: "srt", label: "Subtitles (.srt)" }
          ]}
          onChange={(value) => props.onFormatChange(value as "txt" | "json" | "srt")}
          disabled={controlsLocked || paused}
        />
        <SelectField
          label="CPU Threads"
          Icon={CpuIcon}
          value={props.cpuThreads}
          options={cpuOptions}
          onChange={(value) => props.onCpuChange(Number(value))}
          disabled={controlsLocked || paused}
        />
      </div>
      <div className="transport-deck">
        <div className="transport-deck__file">
          <img src={musicNoteIcon} alt="" aria-hidden="true" />
          <div>
            <strong>{props.selection?.name ?? "No audio selected"}</strong>
            <small>
              {props.selection ? "Ready for local transcription" : "Choose a file above"}
            </small>
          </div>
        </div>
        <JobStatus
          job={props.job}
          running={props.jobRunning}
          hasSelection={Boolean(props.selection)}
        />
        <div className="job-controls">
          <Button
            onClick={props.onStart}
            disabled={
              !props.requiredReady ||
              !props.selection ||
              props.busy ||
              props.jobRunning ||
              (props.job !== null &&
                !["paused", "completed", "stopped", "error"].includes(props.job.state))
            }
          >
            <ControlIcon>
              <path d="m8 5 11 7-11 7z" />
            </ControlIcon>
            {paused ? "Resume" : "Start transcription"}
          </Button>
          <Button
            variant="secondary"
            onClick={props.onPause}
            disabled={!props.job?.canPause || props.busy}
          >
            <ControlIcon>
              <path d="M8 5v14m8-14v14" />
            </ControlIcon>
            Pause
          </Button>
          <Button
            variant="danger"
            onClick={props.onStop}
            disabled={!props.job?.canStop || props.busy}
          >
            <ControlIcon>
              <rect x="7" y="7" width="10" height="10" rx="1" />
            </ControlIcon>
            Stop
          </Button>
        </div>
      </div>
    </section>
  );
}
