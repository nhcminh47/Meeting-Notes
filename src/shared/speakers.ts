export type Speaker = {
  id: string;
  label: string;
  name: string | null;
  source?: "live" | "final" | "manual" | "imported";
};

export type SpeakerFile = {
  schemaVersion: 1;
  meetingId: string;
  speakers: Speaker[];
};

export type SpeakerTurn = {
  speakerId?: string | null;
  speaker?: string | null;
  speakerName?: string | null;
};

export function resolveSpeakerDisplay(turn: SpeakerTurn, speakers: Speaker[]): string {
  const id = turn.speakerId ?? turn.speaker ?? null;
  const metadata = speakers.find((speaker) => speaker.id === id);
  return metadata?.name || metadata?.label || turn.speakerName || id || "UNKNOWN";
}
