import type {
  RuntimeItemStatus,
  RuntimeStatusItem
} from "../../../../main/runtime/runtimeTypes";
import { Badge, type SemanticVariant } from "../atoms/Badge";
import { ProgressBar } from "../atoms/ProgressBar";

function statusVariant(status: RuntimeItemStatus): SemanticVariant {
  if (status === "ready") return "ready";
  if (status === "downloading" || status === "extracting") return "processing";
  if (status === "error") return "error";
  return "neutral";
}

export function RuntimeItem(props: {
  label: string;
  size: string;
  item?: RuntimeStatusItem;
}) {
  const status = props.item?.status ?? "missing";
  const processing = status === "downloading" || status === "extracting";

  return (
    <article className="runtime-item">
      <div>
        <strong>{props.label}</strong>
        <small>{props.size} download</small>
      </div>
      <div className="runtime-item__status">
        <Badge variant={statusVariant(status)}>{status}</Badge>
        {typeof props.item?.progress === "number" && processing && (
          <ProgressBar
            value={props.item.progress}
            label={`${props.label} progress`}
            active
            compact
          />
        )}
      </div>
      {props.item?.error && <p className="inline-error">{props.item.error}</p>}
    </article>
  );
}
