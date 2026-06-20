import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import type { SpeakerFile } from "../../shared/speakers";

export type { Speaker, SpeakerFile } from "../../shared/speakers";

const MEETING_ID = /^mtg_[A-Za-z0-9_-]+$/;
const SPEAKER_ID = /^(?:SPEAKER_[0-9]{2,}|UNKNOWN)$/;
const CONTROL_CHARACTER = /\p{Cc}/u;

export function validateMeetingId(meetingId: string): string {
  if (!MEETING_ID.test(meetingId)) throw new Error("Invalid meeting ID.");
  return meetingId;
}

export function validateSpeakerId(speakerId: string): string {
  if (!SPEAKER_ID.test(speakerId)) throw new Error("Invalid speaker ID.");
  return speakerId;
}

export function normalizeSpeakerName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if ([...trimmed].length > 80) throw new Error("Display name must be 80 characters or fewer.");
  if (CONTROL_CHARACTER.test(name)) throw new Error("Display name cannot contain control characters.");
  return trimmed;
}

function labelFor(speakerId: string): string {
  if (speakerId === "UNKNOWN") return "Unknown speaker";
  return `Speaker ${Number(speakerId.slice("SPEAKER_".length))}`;
}

async function meetingFolder(meetingsRoot: string, meetingId: string): Promise<string> {
  validateMeetingId(meetingId);
  const root = await realpath(meetingsRoot).catch(() => {
    throw new Error("Meetings folder is unavailable.");
  });
  const candidate = path.resolve(root, meetingId);
  if (path.dirname(candidate) !== root) throw new Error("Invalid meeting path.");
  const folder = await realpath(candidate).catch(() => {
    throw new Error("Meeting does not exist.");
  });
  if (path.dirname(folder) !== root || !(await stat(folder)).isDirectory()) {
    throw new Error("Invalid meeting path.");
  }
  return folder;
}

function parseSpeakerFile(contents: string, meetingId: string): SpeakerFile {
  let value: unknown;
  try { value = JSON.parse(contents); }
  catch { throw new Error("Speaker metadata is invalid."); }
  const file = value as Partial<SpeakerFile>;
  if (file.schemaVersion !== 1 || file.meetingId !== meetingId || !Array.isArray(file.speakers)) {
    throw new Error("Speaker metadata is invalid.");
  }
  const seen = new Set<string>();
  for (const speaker of file.speakers) {
    if (!speaker || typeof speaker !== "object") throw new Error("Speaker metadata is invalid.");
    validateSpeakerId(speaker.id);
    if (seen.has(speaker.id) || typeof speaker.label !== "string" || !speaker.label.trim()) {
      throw new Error("Speaker metadata is invalid.");
    }
    if (speaker.name !== null && typeof speaker.name !== "string") {
      throw new Error("Speaker metadata is invalid.");
    }
    if (speaker.name !== null) normalizeSpeakerName(speaker.name);
    seen.add(speaker.id);
  }
  return file as SpeakerFile;
}

async function atomicWrite(target: string, value: SpeakerFile): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  try { await rename(temporary, target); }
  catch (error) {
    const { rm } = await import("node:fs/promises");
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function collectSpeakerIds(value: unknown): string[] {
  const records = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { turns?: unknown }).turns)
      ? (value as { turns: unknown[] }).turns
      : [];
  const ids = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const item = record as { speakerId?: unknown; speaker?: unknown };
    const id = typeof item.speakerId === "string" ? item.speakerId : item.speaker;
    if (typeof id === "string" && SPEAKER_ID.test(id)) ids.add(id);
  }
  return [...ids];
}

async function discoverSpeakers(folder: string): Promise<{ ids: string[]; source: "final" | "live" }> {
  try {
    const finalTranscript = JSON.parse(await readFile(path.join(folder, "final-transcript.json"), "utf8"));
    return { ids: collectSpeakerIds(finalTranscript), source: "final" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Final transcript is invalid.");
  }
  try {
    const lines = (await readFile(path.join(folder, "live-transcript.jsonl"), "utf8"))
      .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    return { ids: collectSpeakerIds(lines), source: "live" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ids: [], source: "live" };
    throw new Error("Live transcript is invalid.");
  }
}

export async function getSpeakers(meetingsRoot: string, meetingId: string): Promise<SpeakerFile> {
  const folder = await meetingFolder(meetingsRoot, meetingId);
  const target = path.join(folder, "speakers.json");
  try {
    return parseSpeakerFile(await readFile(target, "utf8"), meetingId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const discovered = await discoverSpeakers(folder);
  const file: SpeakerFile = {
    schemaVersion: 1,
    meetingId,
    speakers: discovered.ids.map((id) => ({ id, label: labelFor(id), name: null, source: discovered.source }))
  };
  await atomicWrite(target, file);
  return file;
}

export async function renameSpeaker(
  meetingsRoot: string,
  input: { meetingId: string; speakerId: string; name: string }
): Promise<SpeakerFile> {
  validateSpeakerId(input.speakerId);
  const name = normalizeSpeakerName(input.name);
  const folder = await meetingFolder(meetingsRoot, input.meetingId);
  const target = path.join(folder, "speakers.json");
  const file = await getSpeakers(meetingsRoot, input.meetingId);
  const speaker = file.speakers.find((candidate) => candidate.id === input.speakerId);
  if (!speaker) throw new Error("Speaker was not found in this meeting.");
  speaker.name = name;
  await atomicWrite(target, file);
  return file;
}

export async function clearSpeakerName(
  meetingsRoot: string,
  input: { meetingId: string; speakerId: string }
): Promise<SpeakerFile> {
  return renameSpeaker(meetingsRoot, { ...input, name: "" });
}
