import type { RuntimeStatus } from "../../../../main/runtime/runtimeTypes";
import { Button } from "../atoms/Button";
import { RuntimeItem } from "../molecules/RuntimeItem";
import { SectionHeading } from "../molecules/SectionHeading";

export type BusyAction = "install" | "repair" | "medium" | null;

const ITEMS = {
  ffmpeg: { label: "FFmpeg", size: "211 MB" },
  whisper: { label: "whisper.cpp", size: "4 MB" },
  modelSmall: { label: "Small model", size: "465 MB" },
  modelMedium: { label: "Medium model", size: "1.43 GB" }
} as const;

export function RuntimePanel(props: {
  status: RuntimeStatus | null;
  busy: BusyAction;
  workflowLocked: boolean;
  ready: boolean;
  onInstall: () => void;
  onRepair: () => void;
  onMedium: () => void;
}) {
  return (
    <section className={`panel runtime-panel ${props.ready ? "runtime-panel--ready" : ""}`}>
      <SectionHeading
        eyebrow="Local dependencies"
        title="Runtime setup"
        aside={
          <span className="section-meta">
            Manifest {props.status?.runtimeVersion ?? "..."}
          </span>
        }
      />
      <div className="runtime-grid">
        {Object.entries(ITEMS).map(([key, item]) => (
          <RuntimeItem
            key={key}
            label={item.label}
            size={item.size}
            item={props.status?.items[key]}
          />
        ))}
      </div>
      <div className="action-row">
        <Button
          onClick={props.onInstall}
          disabled={props.busy !== null || props.workflowLocked}
        >
          {props.busy === "install" ? "Installing..." : "Install Runtime"}
        </Button>
        <Button
          variant="secondary"
          onClick={props.onRepair}
          disabled={props.busy !== null || props.workflowLocked}
        >
          {props.busy === "repair" ? "Repairing..." : "Repair Runtime"}
        </Button>
        <Button
          variant="secondary"
          onClick={props.onMedium}
          disabled={props.busy !== null || props.workflowLocked}
        >
          {props.busy === "medium" ? "Installing..." : "Install Medium Model"}
        </Button>
      </div>
      <p className="note">
        Required download is about 680 MB. The optional medium model adds about 1.43 GB.
      </p>
    </section>
  );
}
