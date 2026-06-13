import type { LogEvent } from "../../../../shared/apiTypes";

export function EventEntry({ event }: { event: LogEvent }) {
  return (
    <article className={`event-entry event-entry--${event.level}`}>
      <div className="event-entry__heading">
        <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
        <span>{event.level}</span>
        <span>{event.source}</span>
      </div>
      <p>{event.message}</p>
      {event.details && (
        <dl>
          {Object.entries(event.details).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
