import type { LogEvent } from "../../../../shared/apiTypes";

export function EventEntry({ event }: { event: LogEvent }) {
  const timestamp = new Date(event.timestamp);

  return (
    <article className={`event-entry event-entry--${event.level}`}>
      <div className="event-entry__heading">
        <time dateTime={event.timestamp}>{timestamp.toLocaleTimeString()}</time>
        <span className="event-entry__badge event-entry__badge--level">
          {event.level}
        </span>
        <span className="event-entry__badge event-entry__badge--source">
          {event.source}
        </span>
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
