import type { LogSnapshot } from "../../../../shared/apiTypes";
import historyIcon from "../../assets/icons/history.png";
import { Button } from "../atoms/Button";
import { EventEntry } from "../molecules/EventEntry";

export function DiagnosticsPanel(props: {
  snapshot: LogSnapshot | null;
  expanded: boolean;
  debugMode?: boolean;
  onDebugModeChange?: (enabled: boolean) => void;
  onToggle: () => void;
}) {
  const events = props.snapshot?.events ?? [];
  const errorCount = events.filter((event) => event.level === "error").length;
  const eventLabel = `${events.length} ${events.length === 1 ? "event" : "events"}`;
  const errorLabel = `${errorCount} ${errorCount === 1 ? "error" : "errors"}`;

  return (
    <section
      className={`panel diagnostics-panel${
        props.expanded ? " diagnostics-panel--expanded" : ""
      }`}
    >
      <Button
        variant="ghost"
        className="diagnostics-panel__toggle"
        onClick={props.onToggle}
        aria-expanded={props.expanded}
      >
        <span className="diagnostics-panel__title">
          <span className="toggle-mark" aria-hidden="true">
            {props.expanded ? "\u2212" : "+"}
          </span>
          <img className="diagnostics-panel__icon" src={historyIcon} alt="" />
          <span>Studio event log</span>
        </span>
        <span className="log-summary">
          <span>{eventLabel}</span>
          {errorCount > 0 && <strong>{errorLabel}</strong>}
        </span>
      </Button>
      {props.expanded && (
        <div className="diagnostics-panel__body">
          <label className="diagnostics-panel__debug-toggle">
            <input
              type="checkbox"
              checked={props.debugMode ?? false}
              onChange={(event) => props.onDebugModeChange?.(event.target.checked)}
            />
            <span>Developer diagnostics</span>
          </label>
          <p className="log-path">
            <span>Persistent log:</span>
            <code title={props.snapshot?.logFilePath}>
              {props.snapshot?.logFilePath ?? "Loading..."}
            </code>
          </p>
          <div className="diagnostics-panel__console">
            <div
              className="event-list"
              role="log"
              aria-label="Application event log"
              aria-relevant="additions"
            >
              {events.length === 0 && <p className="empty-log">No events recorded yet.</p>}
              {[...events].reverse().map((event) => (
                <EventEntry event={event} key={event.id} />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
