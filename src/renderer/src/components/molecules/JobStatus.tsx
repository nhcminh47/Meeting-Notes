import type { CSSProperties } from "react";
import type { TranscriptionJobStatus } from "../../../../shared/apiTypes";
import { Badge, type SemanticVariant } from "../atoms/Badge";
import waveformIcon from "../../assets/icons/waveform.png";

const WAVEFORM_BARS = [
  10, 12, 15, 18, 23, 30, 38, 48, 60, 72, 84, 92, 78, 88, 100, 88, 78, 92, 84,
  72, 60, 48, 38, 30, 23, 18, 15, 12, 10
];

function jobVariant(state?: TranscriptionJobStatus["state"]): SemanticVariant {
  if (state === "completed") return "success";
  if (state === "paused") return "paused";
  if (state === "error" || state === "stopped") return "error";
  if (state && ["queued", "converting", "transcribing"].includes(state)) {
    return "processing";
  }
  return "neutral";
}

export function JobStatus(props: {
  job: TranscriptionJobStatus | null;
  running: boolean;
  hasSelection: boolean;
}) {
  const phase = props.job?.phase ?? "Ready to start";
  const progress = props.job?.progress ?? 0;
  const state = props.job?.state ?? "idle";
  const progressCutoff = Math.round((progress / 100) * WAVEFORM_BARS.length);
  const activeWaveform = props.hasSelection || props.running || progress > 0;

  return (
    <div
      className={`job-status ${activeWaveform ? "job-status--active" : ""}`}
      aria-label="Transcription progress"
    >
      <div className="job-status__topline">
        <strong className="job-status__phase">{phase}</strong>
        <span className="job-status__percentage">{progress}%</span>
      </div>
      <div
        className="job-status__waveform"
        role="progressbar"
        aria-label="Transcription completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        {WAVEFORM_BARS.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className={index < progressCutoff ? "job-status__waveform-bar--complete" : ""}
            style={{ "--wave-height": `${height}%` } as CSSProperties}
          />
        ))}
      </div>
      <div className="job-status__meta">
        <Badge variant={jobVariant(props.job?.state)}>
          <img src={waveformIcon} alt="" aria-hidden="true" />
          {state}
        </Badge>
        <span>Processed entirely on this device</span>
      </div>
    </div>
  );
}
