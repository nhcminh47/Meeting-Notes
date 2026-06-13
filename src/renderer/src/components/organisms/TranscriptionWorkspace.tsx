import type {
  AudioFileSelection,
  TranscriptionJobStatus
} from "../../../../shared/apiTypes";
import { Button } from "../atoms/Button";
import { SelectField } from "../atoms/SelectField";
import { FilePicker } from "../molecules/FilePicker";
import { JobStatus } from "../molecules/JobStatus";
import { SectionHeading } from "../molecules/SectionHeading";

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
  text: string;
  outputFiles: string[];
  onPickFile: () => void;
  onModelChange: (value: "small" | "medium") => void;
  onLanguageChange: (value: "vi" | "en" | "auto") => void;
  onFormatChange: (value: "txt" | "json" | "srt") => void;
  onCpuChange: (value: number) => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  const controlsLocked = !props.requiredReady || props.busy || props.jobRunning;
  const paused = props.job?.state === "paused";

  return (
    <section
      className={`panel transcription-workspace ${
        !props.requiredReady ? "transcription-workspace--disabled" : ""
      }`}
    >
      <SectionHeading eyebrow="Audio workflow" title="Transcribe a file" />
      {!props.requiredReady && (
        <div className="blocked-message">
          Install the required runtime to enable transcription.
        </div>
      )}
      <FilePicker
        fileName={props.selection?.name}
        disabled={!props.requiredReady || props.busy || Boolean(props.job?.canStop)}
        onPick={props.onPickFile}
      />
      <div className="control-grid">
        <SelectField
          label="Model"
          value={props.model}
          onChange={(event) =>
            props.onModelChange(event.target.value as "small" | "medium")
          }
          disabled={controlsLocked || paused}
        >
          <option value="small">Small</option>
          <option value="medium" disabled={!props.mediumReady}>
            Medium {!props.mediumReady ? "(not installed)" : ""}
          </option>
        </SelectField>
        <SelectField
          label="Language"
          value={props.language}
          onChange={(event) =>
            props.onLanguageChange(event.target.value as "vi" | "en" | "auto")
          }
          disabled={controlsLocked || paused}
        >
          <option value="vi">Vietnamese</option>
          <option value="en">English</option>
          <option value="auto">Auto detect</option>
        </SelectField>
        <SelectField
          label="Output"
          value={props.format}
          onChange={(event) =>
            props.onFormatChange(event.target.value as "txt" | "json" | "srt")
          }
          disabled={controlsLocked || paused}
        >
          <option value="txt">Text</option>
          <option value="json">JSON</option>
          <option value="srt">Subtitles</option>
        </SelectField>
        <SelectField
          label="CPU usage"
          value={props.cpuThreads}
          onChange={(event) => props.onCpuChange(Number(event.target.value))}
          disabled={controlsLocked || paused}
        >
          <option value={Math.max(1, Math.ceil(props.logicalCpuCount * 0.5))}>
            Balanced ({Math.max(1, Math.ceil(props.logicalCpuCount * 0.5))} threads)
          </option>
          <option value={Math.max(1, Math.ceil(props.logicalCpuCount * 0.75))}>
            High ({Math.max(1, Math.ceil(props.logicalCpuCount * 0.75))} threads)
          </option>
          <option value={props.logicalCpuCount}>
            Maximum ({props.logicalCpuCount} threads)
          </option>
        </SelectField>
      </div>
      <JobStatus job={props.job} running={props.jobRunning} />
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
          {paused ? "Resume" : "Start"}
        </Button>
        <Button
          variant="secondary"
          onClick={props.onPause}
          disabled={!props.job?.canPause || props.busy}
        >
          Pause
        </Button>
        <Button
          variant="danger"
          onClick={props.onStop}
          disabled={!props.job?.canStop || props.busy}
        >
          Stop
        </Button>
      </div>
      {(props.text || props.outputFiles.length > 0) && (
        <div className="result">
          <p className="eyebrow">Finished locally</p>
          <h3>Result</h3>
          <pre>{props.text || "The transcript file was generated."}</pre>
          {props.outputFiles.map((file) => (
            <code key={file}>{file}</code>
          ))}
        </div>
      )}
    </section>
  );
}
