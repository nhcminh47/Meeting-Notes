export type MascotState =
  | "setup"
  | "ready"
  | "processing"
  | "paused"
  | "completed"
  | "error";

export function CatMascot({ state }: { state: MascotState }) {
  return (
    <div className={`cat-mascot cat-mascot--${state}`} aria-hidden="true">
      <svg viewBox="0 0 160 140" focusable="false" aria-hidden="true">
        <path className="cat-mascot__tail" d="M119 109c26 5 31-25 12-30" />
        <path className="cat-mascot__body" d="M48 123c2-31 15-46 33-46s31 15 33 46" />
        <path className="cat-mascot__ear" d="M49 48 43 15l30 21M111 48l7-33-31 21" />
        <path
          className="cat-mascot__head"
          d="M45 49c5-22 65-22 70 0 8 34-10 57-35 57S37 83 45 49Z"
        />
        <path className="cat-mascot__fringe" d="m61 34 8 15 10-18 10 18 10-15" />
        <path className="cat-mascot__eye cat-mascot__eye--left" d="M60 66h9" />
        <path className="cat-mascot__eye cat-mascot__eye--right" d="M91 66h9" />
        <path className="cat-mascot__mouth" d="m76 78 4 3 4-3m-4 3v5" />
        <path className="cat-mascot__whisker" d="M54 78 32 73m23 13-22 5m73-13 22-5m-23 13 22 5" />
        <path className="cat-mascot__headphones" d="M43 58c-8-1-10 21 1 22m72-22c8-1 10 21-1 22" />
        <circle className="cat-mascot__signal" cx="127" cy="26" r="9" />
      </svg>
    </div>
  );
}
