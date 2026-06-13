export function ProgressBar(props: {
  value: number;
  label: string;
  active?: boolean;
  compact?: boolean;
}) {
  const value = Math.min(100, Math.max(0, props.value));
  return (
    <div
      className={`progress-bar ${props.active ? "progress-bar--active" : ""} ${
        props.compact ? "progress-bar--compact" : ""
      }`.trim()}
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
