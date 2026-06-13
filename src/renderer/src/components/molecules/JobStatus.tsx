import type { TranscriptionJobStatus } from "../../../../shared/apiTypes";
import { Badge, type SemanticVariant } from "../atoms/Badge";
import { ProgressBar } from "../atoms/ProgressBar";

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
}) {
  const phase = props.job?.phase ?? "Ready to start";
  const progress = props.job?.progress ?? 0;
  const state = props.job?.state ?? "idle";

  return (
    <div className="job-status" aria-label="Transcription progress">
      <div className="job-status__heading">
        <span>{phase}</span>
        <strong>{progress}%</strong>
      </div>
      <ProgressBar
        value={progress}
        label="Transcription completion"
        active={props.running}
      />
      <Badge variant={jobVariant(props.job?.state)}>{state}</Badge>
    </div>
  );
}
