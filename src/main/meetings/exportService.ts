import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolveSpeakerDisplay, type Speaker } from "../../shared/speakers";
import type { ExportFormat, ExportMeetingResult } from "../../shared/apiTypes";
import { getSpeakers, meetingFolder } from "./speakerStore";

type FinalTranscriptTurn = {
  id: string;
  meetingId: string;
  speakerId?: string | null;
  speaker?: string | null;
  speakerName?: string | null;
  start: number;
  end: number;
  text: string;
  language?: string;
  source?: string;
  isFinal: true;
  confidence?: number | null;
};

type FinalTranscriptFile = {
  schemaVersion: 1;
  meetingId: string;
  language?: string;
  title?: string;
  turns: FinalTranscriptTurn[];
};

type MeetingMetadata = {
  id?: string;
  title?: string;
  language?: string;
};

const TRANSCRIPT_FORMATS = new Set<ExportFormat>(["txt", "json", "srt", "vtt"]);
const EXPORT_FILENAMES: Record<ExportFormat, string> = {
  txt: "transcript.txt",
  json: "transcript.json",
  srt: "transcript.srt",
  vtt: "transcript.vtt",
  md: "meeting-note.md"
};

function parseJson(contents: string, safeMessage: string): unknown {
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(safeMessage);
  }
}

function parseFinalTranscript(contents: string, meetingId: string): FinalTranscriptFile {
  const raw = parseJson(contents, "Final transcript is invalid.") as Partial<FinalTranscriptFile>;
  if (!raw || typeof raw !== "object" || raw.schemaVersion !== 1 || raw.meetingId !== meetingId || !Array.isArray(raw.turns)) {
    throw new Error("Final transcript is invalid.");
  }
  for (const candidate of raw.turns) {
    const turn = candidate as Partial<FinalTranscriptTurn>;
    const speakerValue = turn.speakerId ?? turn.speaker;
    if (!candidate || typeof candidate !== "object" || typeof turn.id !== "string" || turn.meetingId !== meetingId ||
      (speakerValue !== null && speakerValue !== undefined && typeof speakerValue !== "string") ||
      (turn.speakerName !== null && turn.speakerName !== undefined && typeof turn.speakerName !== "string") ||
      typeof turn.start !== "number" || !Number.isFinite(turn.start) || turn.start < 0 ||
      typeof turn.end !== "number" || !Number.isFinite(turn.end) || turn.end < turn.start ||
      typeof turn.text !== "string" || turn.isFinal !== true) {
      throw new Error("Final transcript is invalid.");
    }
  }
  return raw as FinalTranscriptFile;
}

function parseMetadata(contents: string, meetingId: string): MeetingMetadata {
  const raw = parseJson(contents, "Meeting metadata is invalid.") as MeetingMetadata;
  if (!raw || typeof raw !== "object" || (raw.id !== undefined && raw.id !== meetingId)) {
    throw new Error("Meeting metadata is invalid.");
  }
  return raw;
}

function sortTurns(turns: FinalTranscriptTurn[]): FinalTranscriptTurn[] {
  return [...turns]
    .filter((turn) => turn.text.trim())
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
}

function clock(seconds: number, milliseconds: "." | "," | false): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const base = [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
  return milliseconds ? `${base}${milliseconds}${String(ms).padStart(3, "0")}` : base;
}

export function formatTranscriptTxt(turns: FinalTranscriptTurn[], speakers: Speaker[]): string {
  return sortTurns(turns)
    .map((turn) => `[${clock(turn.start, false)}] ${resolveSpeakerDisplay(turn, speakers)}: ${turn.text.trim()}`)
    .join("\n\n") + "\n";
}

export function formatTranscriptSrt(turns: FinalTranscriptTurn[], speakers: Speaker[]): string {
  return sortTurns(turns)
    .map((turn, index) => [
      String(index + 1),
      `${clock(turn.start, ",")} --> ${clock(turn.end, ",")}`,
      `${resolveSpeakerDisplay(turn, speakers)}: ${turn.text.trim()}`
    ].join("\n"))
    .join("\n\n") + "\n";
}

export function formatTranscriptVtt(turns: FinalTranscriptTurn[], speakers: Speaker[]): string {
  const cues = sortTurns(turns)
    .map((turn) => [
      `${clock(turn.start, ".")} --> ${clock(turn.end, ".")}`,
      `${resolveSpeakerDisplay(turn, speakers)}: ${turn.text.trim()}`
    ].join("\n"))
    .join("\n\n");
  return `WEBVTT\n\n${cues}${cues ? "\n" : ""}`;
}

export function formatTranscriptJson(input: {
  meetingId: string;
  metadata: MeetingMetadata;
  transcript: FinalTranscriptFile;
  speakers: Speaker[];
  exportedAt: string;
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    meetingId: input.meetingId,
    title: input.metadata.title ?? input.transcript.title ?? null,
    language: input.metadata.language ?? input.transcript.language ?? "en",
    exportedAt: input.exportedAt,
    source: "final-transcript.json",
    speakers: input.speakers.map((speaker) => ({
      id: speaker.id,
      label: speaker.label,
      name: speaker.name
    })),
    turns: sortTurns(input.transcript.turns)
  }, null, 2) + "\n";
}

async function atomicWrite(target: string, contents: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { flag: "wx", encoding: "utf8" });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export class ExportService {
  constructor(private readonly root: string) {}

  async exportMeeting(input: { meetingId: string; formats: ExportFormat[] }): Promise<ExportMeetingResult> {
    const formats = [...new Set(input.formats)];
    if (!formats.length) throw new Error("Choose at least one export format.");
    for (const format of formats) {
      if (!(format in EXPORT_FILENAMES)) throw new Error("Unsupported export format.");
    }

    const folder = await meetingFolder(this.root, input.meetingId);
    const exportsFolder = path.join(folder, "exports");
    await mkdir(exportsFolder, { recursive: true });

    const files: ExportMeetingResult["files"] = [];
    let transcriptContext: { transcript: FinalTranscriptFile; metadata: MeetingMetadata; speakers: Speaker[] } | null = null;

    for (const format of formats) {
      const filename = EXPORT_FILENAMES[format];
      const target = path.join(exportsFolder, filename);
      if (path.dirname(target) !== exportsFolder) throw new Error("Invalid export path.");

      let contents: string;
      if (format === "md") {
        try {
          contents = await readFile(path.join(folder, "meeting-note.md"), "utf8");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Meeting note is required for Markdown export.");
          throw new Error("Meeting note could not be read.");
        }
      } else {
        if (!transcriptContext) {
          let rawTranscript: string;
          try {
            rawTranscript = await readFile(path.join(folder, "final-transcript.json"), "utf8");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Final transcript is required for transcript export.");
            throw new Error("Final transcript could not be read.");
          }
          const transcript = parseFinalTranscript(rawTranscript, input.meetingId);
          if (!sortTurns(transcript.turns).length) throw new Error("Final transcript contains no dialogue to export.");
          transcriptContext = {
            transcript,
            metadata: parseMetadata(await readFile(path.join(folder, "metadata.json"), "utf8"), input.meetingId),
            speakers: (await getSpeakers(this.root, input.meetingId)).speakers
          };
        }
        if (!TRANSCRIPT_FORMATS.has(format)) throw new Error("Unsupported export format.");
        if (format === "txt") contents = formatTranscriptTxt(transcriptContext.transcript.turns, transcriptContext.speakers);
        else if (format === "json") contents = formatTranscriptJson({ meetingId: input.meetingId, ...transcriptContext, exportedAt: new Date().toISOString() });
        else if (format === "srt") contents = formatTranscriptSrt(transcriptContext.transcript.turns, transcriptContext.speakers);
        else contents = formatTranscriptVtt(transcriptContext.transcript.turns, transcriptContext.speakers);
      }

      try {
        await atomicWrite(target, contents);
      } catch {
        throw new Error("Export file could not be saved.");
      }
      files.push({ format, path: `exports/${filename}` });
    }

    return { ok: true, files };
  }
}
