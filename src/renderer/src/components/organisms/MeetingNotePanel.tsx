import { useEffect, useState } from "react";
import type { MeetingNoteView } from "../../../../shared/apiTypes";
import { Button } from "../atoms/Button";

export function MeetingNotePanel({ meetingId }: { meetingId: string }) {
  const [note, setNote] = useState<MeetingNoteView | null>(null);
  const [state, setState] = useState<"idle" | "generating" | "completed" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    window.localStudio.meetingNotes.get({ meetingId }).then((value) => {
      if (!active) return;
      setNote(value);
      setState(value ? "completed" : "idle");
    }).catch(() => active && setState("idle"));
    return () => { active = false; };
  }, [meetingId]);

  async function generate() {
    setState("generating");
    setError("");
    try {
      const value = note
        ? await window.localStudio.meetingNotes.regenerate({ meetingId })
        : await window.localStudio.meetingNotes.generate({ meetingId });
      setNote(value);
      setState("completed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Meeting note generation failed.");
      setState("error");
    }
  }

  return (
    <section className="meeting-note" aria-labelledby="meeting-note-title">
      <div className="meeting-note__heading">
        <div><p className="eyebrow">Derived from final dialogue</p><h3 id="meeting-note-title">Meeting Note</h3></div>
        <span>{state}</span>
      </div>
      <p>Uses the final speaker-aware transcript and current local speaker names.</p>
      <Button onClick={() => void generate()} disabled={state === "generating"}>
        {state === "generating" ? "Generating…" : note ? "Regenerate Meeting Note" : "Generate Meeting Note"}
      </Button>
      {error && <p className="meeting-note__error" role="alert">{error}</p>}
      {note && <pre className="meeting-note__preview" aria-label="Generated meeting note">{note.markdown}</pre>}
    </section>
  );
}
