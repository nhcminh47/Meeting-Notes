import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export type MeetingRecord = {
  schemaVersion: 1;
  id: string;
  title: string;
  language: "en";
  status: "created" | "recording" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  recordingPath: "recording.wav";
  liveTranscriptPath: "live-transcript.jsonl";
  finalTranscriptPath: "final-transcript.json";
  speakersPath: "speakers.json";
  notePath: "meeting-note.md";
  exportsPath: "exports";
  serverSessionId?: string;
  finalized: false;
};

export type LocalMeeting = { folder: string; metadata: MeetingRecord };

function meetingId(now: Date): string {
  return `mtg_${now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
}

export async function createLiveMeeting(meetingsRoot: string, now = new Date()): Promise<LocalMeeting> {
  const id = meetingId(now);
  const folder = path.join(meetingsRoot, id);
  const timestamp = now.toISOString();
  const metadata: MeetingRecord = {
    schemaVersion: 1,
    id,
    title: "Remote English Live Meeting",
    language: "en",
    status: "recording",
    createdAt: timestamp,
    startedAt: timestamp,
    endedAt: null,
    recordingPath: "recording.wav",
    liveTranscriptPath: "live-transcript.jsonl",
    finalTranscriptPath: "final-transcript.json",
    speakersPath: "speakers.json",
    notePath: "meeting-note.md",
    exportsPath: "exports",
    finalized: false
  };
  const speakers = {
    schemaVersion: 1,
    meetingId: id,
    speakers: [
      { id: "SPEAKER_01", label: "Speaker 1", name: null, source: "live" },
      { id: "UNKNOWN", label: "Unknown speaker", name: null, source: "live" }
    ]
  };
  await mkdir(meetingsRoot, { recursive: true });
  await mkdir(folder, { recursive: false });
  await Promise.all([
    writeFile(path.join(folder, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", { flag: "wx" }),
    writeFile(path.join(folder, "speakers.json"), JSON.stringify(speakers, null, 2) + "\n", { flag: "wx" }),
    writeFile(path.join(folder, "live-transcript.jsonl"), "", { flag: "wx" })
  ]);
  return { folder, metadata };
}

export async function updateMeeting(
  meeting: LocalMeeting,
  patch: Partial<Pick<MeetingRecord, "status" | "endedAt" | "serverSessionId">>
): Promise<void> {
  meeting.metadata = { ...meeting.metadata, ...patch };
  const target = path.join(meeting.folder, "metadata.json");
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(meeting.metadata, null, 2) + "\n");
  const { rename } = await import("node:fs/promises");
  await rename(temporary, target);
}
