import type { LogSnapshot } from "../../../../shared/apiTypes";
import { Button } from "../atoms/Button";
import { EventEntry } from "../molecules/EventEntry";

export function DiagnosticsPanel(props: {
  snapshot: LogSnapshot | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const events = props.snapshot?.events ?? [];
  const errorCount = events.filter((event) => event.level === "error").length;

  return (
    <section className="panel diagnostics-panel">
      <Button
        variant="ghost"
        className="diagnostics-panel__toggle"
        onClick={props.onToggle}
        aria-expanded={props.expanded}
      >
        <span>
          <span className="toggle-mark">{props.expanded ? "−" : "+"}</span>
          Event log
        </span>
        <span className="log-summary">
          {events.length} events
          {errorCount > 0 && <strong>{errorCount} errors</strong>}
        </span>
      </Button>
      {props.expanded && (
        <div className="diagnostics-panel__body">
          <p className="log-path">
            Persistent log: <code>{props.snapshot?.logFilePath ?? "Loading..."}</code>
          </p>
          <div className="event-list" role="log" aria-label="Application event log">
            {events.length === 0 && <p className="empty-log">No events recorded yet.</p>}
            {[...events].reverse().map((event) => (
              <EventEntry event={event} key={event.id} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
