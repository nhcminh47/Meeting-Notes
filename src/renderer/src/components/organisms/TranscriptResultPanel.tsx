import { Fragment, useEffect, useMemo, useRef, useState } from "react";

type OutputFormat = "txt" | "json" | "srt";

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function findMatches(text: string, query: string): Array<[number, number]> {
  if (!query) return [];
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(text.matchAll(new RegExp(escapedQuery, "giu")), (match) => [
    match.index,
    match.index + match[0].length
  ]);
}

function HighlightedTranscript(props: {
  text: string;
  matches: Array<[number, number]>;
}) {
  if (props.matches.length === 0) return props.text;

  const parts = [];
  let cursor = 0;

  for (const [index, [start, end]] of props.matches.entries()) {
    parts.push(
      <Fragment key={`match-${start}-${index}`}>
        {props.text.slice(cursor, start)}
        <mark>{props.text.slice(start, end)}</mark>
      </Fragment>
    );
    cursor = end;
  }
  parts.push(props.text.slice(cursor));
  return parts;
}

export function TranscriptResultPanel(props: {
  jobId: string;
  text: string;
  outputFiles: string[];
  format: OutputFormat;
  selectedFileName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const copyResetTimer = useRef<number | null>(null);
  const safeJobId = props.jobId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const contentId = `transcript-result-${safeJobId}`;
  const outputName = props.outputFiles[0]
    ? fileNameFromPath(props.outputFiles[0])
    : props.selectedFileName;
  const matches = useMemo(() => findMatches(props.text, query), [props.text, query]);
  const matchLabel = `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;

  useEffect(
    () => () => {
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    },
    []
  );

  if (!props.text && props.outputFiles.length === 0) return null;

  async function copyTranscript() {
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(props.text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    copyResetTimer.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyResetTimer.current = null;
    }, 1800);
  }

  return (
    <section className="transcript-result">
      <button
        className="transcript-result__toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="transcript-result__heading">
          <span className="transcript-result__mark" aria-hidden="true">
            {expanded ? "\u2212" : "+"}
          </span>
          <span className="transcript-result__title">Transcript result</span>
          <span className="transcript-result__status">Finished locally</span>
        </span>
        <span className="transcript-result__metadata">
          <span>{props.format.toUpperCase()}</span>
          {outputName && <span title={outputName}>{outputName}</span>}
        </span>
      </button>

      {expanded && (
        <div className="transcript-result__body" id={contentId}>
          {props.text && (
            <div className="transcript-result__toolbar">
              <div className="transcript-result__search">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6" />
                  <path d="m16 16 4 4" />
                </svg>
                <input
                  id={`${contentId}-search`}
                  type="search"
                  aria-label="Search transcript"
                  value={query}
                  placeholder="Search transcript..."
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    className="transcript-result__clear"
                    type="button"
                    aria-label="Clear transcript search"
                    onClick={() => setQuery("")}
                  >
                    {"\u00d7"}
                  </button>
                )}
              </div>
              <span className="transcript-result__matches" aria-live="polite">
                {matchLabel}
              </span>
              <button
                className="transcript-result__copy"
                type="button"
                onClick={copyTranscript}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="8" y="8" width="11" height="12" rx="2" />
                  <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
                </svg>
                {copyStatus === "copied" ? "Copied" : "Copy all"}
              </button>
              <span
                className={`transcript-result__copy-status transcript-result__copy-status--${copyStatus}`}
                role={copyStatus === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {copyStatus === "copied"
                  ? "Transcript copied to clipboard."
                  : copyStatus === "error"
                    ? "Copy failed. Clipboard access is unavailable."
                    : ""}
              </span>
            </div>
          )}
          <div className="transcript-result__preview" tabIndex={0}>
            {props.text ? (
              <HighlightedTranscript text={props.text} matches={matches} />
            ) : (
              <span className="transcript-result__empty">
                The transcript file was generated without a text preview.
              </span>
            )}
          </div>
          {props.outputFiles.length > 0 && (
            <div className="transcript-result__paths">
              <span>Saved to</span>
              <ul>
                {props.outputFiles.map((file) => (
                  <li key={file}>
                    <code>{file}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
