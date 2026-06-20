import { useEffect, useState } from "react";
import type { Speaker } from "../../../../shared/speakers";
import { Button } from "../atoms/Button";

export function SpeakerRenamePanel(props: {
  meetingId: string;
  onSpeakersChange: (speakers: Speaker[]) => void;
}) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function apply(next: Speaker[]) {
    setSpeakers(next);
    setNames(Object.fromEntries(next.map((speaker) => [speaker.id, speaker.name ?? ""])));
    props.onSpeakersChange(next);
  }

  useEffect(() => {
    let current = true;
    setError("");
    window.localStudio.speakers.getSpeakers(props.meetingId)
      .then((file) => { if (current) apply(file.speakers); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "Speakers could not be loaded."); });
    return () => { current = false; };
  }, [props.meetingId]);

  async function save(speakerId: string) {
    setBusyId(speakerId);
    setError("");
    try {
      const file = await window.localStudio.speakers.renameSpeaker({
        meetingId: props.meetingId,
        speakerId,
        name: names[speakerId] ?? ""
      });
      apply(file.speakers);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Display name could not be saved.");
    } finally { setBusyId(null); }
  }

  async function clear(speakerId: string) {
    setBusyId(speakerId);
    setError("");
    try {
      const file = await window.localStudio.speakers.clearSpeakerName({ meetingId: props.meetingId, speakerId });
      apply(file.speakers);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Display name could not be cleared.");
    } finally { setBusyId(null); }
  }

  return (
    <section className="speaker-rename" aria-labelledby="speaker-rename-title">
      <h3 id="speaker-rename-title">Speakers</h3>
      {speakers.length === 0 && !error && <p>Loading detected speakers…</p>}
      {speakers.map((speaker) => (
        <div className="speaker-rename__row" key={speaker.id}>
          <div className="speaker-rename__identity">
            <strong>{speaker.id}</strong>
            <span>Label: {speaker.label}</span>
          </div>
          <label>
            <span>Display name</span>
            <input
              aria-label={`Display name for ${speaker.id}`}
              value={names[speaker.id] ?? ""}
              onChange={(event) => setNames((current) => ({ ...current, [speaker.id]: event.target.value }))}
              maxLength={160}
              disabled={busyId === speaker.id}
            />
          </label>
          <div className="speaker-rename__actions">
            <Button onClick={() => void save(speaker.id)} disabled={busyId !== null}>Save</Button>
            <Button variant="secondary" onClick={() => void clear(speaker.id)} disabled={busyId !== null || !speaker.name}>Clear</Button>
          </div>
        </div>
      ))}
      {error && <p className="speaker-rename__error" role="alert">{error}</p>}
    </section>
  );
}
