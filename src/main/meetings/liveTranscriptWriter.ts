import path from "node:path";
import { appendFile } from "node:fs/promises";
import type { LiveConnectionEvent } from "../../shared/apiTypes";

export function toPersistedTurn(meetingId: string, event: LiveConnectionEvent): Record<string, unknown> | null {
  if (event.type !== "turn_final") return null;
  return {
    type: "turn_final",
    meetingId,
    turnId: event.turnId,
    speakerId: event.speaker === "SPEAKER_01" ? "SPEAKER_01" : "UNKNOWN",
    speakerName: null,
    start: event.start,
    end: event.end,
    text: event.text,
    language: "en",
    source: "live",
    isFinal: true
  };
}

export async function appendFinalTurn(folder: string, meetingId: string, event: LiveConnectionEvent): Promise<boolean> {
  const turn = toPersistedTurn(meetingId, event);
  if (!turn) return false;
  await appendFile(path.join(folder, "live-transcript.jsonl"), JSON.stringify(turn) + "\n", "utf8");
  return true;
}
