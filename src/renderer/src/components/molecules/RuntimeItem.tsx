import type {
  RuntimeItemStatus,
  RuntimeStatusItem
} from "../../../../main/runtime/runtimeTypes";
import { Badge, type SemanticVariant } from "../atoms/Badge";
import { ProgressBar } from "../atoms/ProgressBar";
import featherIcon from "../../assets/icons/feather.png";
import successIcon from "../../assets/icons/status-success.png";
import warningIcon from "../../assets/icons/status-warning.png";

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
    <article className={`runtime-item runtime-item--${status}`}>
      <span className="runtime-item__icon" aria-hidden="true">
        <img
          src={
            status === "ready"
              ? successIcon
              : status === "error"
                ? warningIcon
                : featherIcon
          }
          alt=""
        />
      </span>
      <div className="runtime-item__copy">
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
