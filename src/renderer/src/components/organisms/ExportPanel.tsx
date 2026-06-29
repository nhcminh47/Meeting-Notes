import { useState } from "react";
import type { ExportFormat, ExportMeetingResult } from "../../../../shared/apiTypes";
import { Button } from "../atoms/Button";

const FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: "txt", label: "TXT" },
  { value: "json", label: "JSON" },
  { value: "srt", label: "SRT" },
  { value: "vtt", label: "VTT" },
  { value: "md", label: "Markdown note" }
];

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

export function ExportPanel({ meetingId }: { meetingId: string }) {
  const [formats, setFormats] = useState<ExportFormat[]>(["txt", "json", "srt", "vtt", "md"]);
  const [state, setState] = useState<"idle" | "exporting" | "completed" | "error">("idle");
  const [result, setResult] = useState<ExportMeetingResult | null>(null);
  const [error, setError] = useState("");

  function toggle(format: ExportFormat) {
    setFormats((current) =>
      current.includes(format)
        ? current.filter((candidate) => candidate !== format)
        : [...current, format]
    );
  }

  async function exportMeeting() {
    setState("exporting");
    setError("");
    setResult(null);
    try {
      const value = await window.localStudio.exports.exportMeeting({ meetingId, formats });
      setResult(value);
      setState("completed");
    } catch (cause) {
      setError(friendlyError(cause));
      setState("error");
    }
  }

  return (
    <section className="export-panel" aria-labelledby="export-panel-title">
      <div className="export-panel__heading">
        <div>
          <p className="eyebrow">Local derived artifacts</p>
          <h3 id="export-panel-title">Exports</h3>
        </div>
        <span>{state}</span>
      </div>
      <div className="export-panel__formats" aria-label="Export formats">
        {FORMATS.map((format) => (
          <label key={format.value}>
            <input
              type="checkbox"
              checked={formats.includes(format.value)}
              onChange={() => toggle(format.value)}
            />
            <span>{format.label}</span>
          </label>
        ))}
      </div>
      <Button onClick={() => void exportMeeting()} disabled={state === "exporting" || formats.length === 0}>
        {state === "exporting" ? "Exporting..." : "Export selected"}
      </Button>
      {error && <p className="export-panel__error" role="alert">{error}</p>}
      {result && (
        <ul className="export-panel__files" aria-label="Exported files">
          {result.files.map((file) => (
            <li key={`${file.format}-${file.path}`}><code>{file.path}</code></li>
          ))}
        </ul>
      )}
    </section>
  );
}
