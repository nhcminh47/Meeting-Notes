import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolveSpeakerDisplay, type Speaker } from "../../shared/speakers";
import { getSpeakers, meetingFolder } from "./speakerStore";

const MAX_DIALOGUE_CHARACTERS = 500_000;
const REQUIRED_SECTIONS = [
  "Summary",
  "Key Decisions",
  "Action Items",
  "Open Questions",
  "Risks / Blockers",
  "Follow-up Topics"
] as const;

export type FinalTranscriptTurn = {
  id: string;
  meetingId: string;
  speakerId: string;
  speakerName: string | null;
  start: number;
  end: number;
  text: string;
  isFinal: true;
};

export type MeetingNoteInput = {
  meetingId: string;
  source: "final-transcript.json";
  turns: FinalTranscriptTurn[];
  speakers: Speaker[];
  dialogue: string;
};

export type MeetingNoteResult = { markdown: string };

export interface MeetingNoteSummarizer {
  generateNote(input: MeetingNoteInput): Promise<MeetingNoteResult>;
}

export type MeetingNoteView = {
  meetingId: string;
  status: "completed";
  source: "final-transcript.json";
  markdown: string;
};

function timestamp(seconds: number): string {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}

export function buildMeetingDialogue(turns: FinalTranscriptTurn[], speakers: Speaker[]): string {
  return [...turns]
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
    .filter((turn) => turn.text.trim())
    .map((turn) => `[${timestamp(turn.start)}] ${resolveSpeakerDisplay(turn, speakers)}: ${turn.text.trim()}`)
    .join("\n");
}

function evidence(turn: FinalTranscriptTurn, speakers: Speaker[]): string {
  return `${resolveSpeakerDisplay(turn, speakers)} at ${timestamp(turn.start)}`;
}

function bulletLines(lines: string[]): string {
  return lines.length ? lines.map((line) => `- ${line}`).join("\n") : "- None identified.";
}

export class TemplateMeetingNoteSummarizer implements MeetingNoteSummarizer {
  async generateNote(input: MeetingNoteInput): Promise<MeetingNoteResult> {
    const decisions: string[] = [];
    const questions: string[] = [];
    const risks: string[] = [];
    const followUps: string[] = [];
    const actions: Array<{ owner: string; action: string; due: string; evidence: string }> = [];

    for (const turn of input.turns) {
      const text = turn.text.trim();
      const lower = text.toLowerCase();
      const owner = resolveSpeakerDisplay(turn, input.speakers);
      if (/\b(decided|agreed|approved|we will)\b/i.test(text)) decisions.push(`${text} (${evidence(turn, input.speakers)})`);
      if (text.endsWith("?") || /\b(open question|need to determine|unclear)\b/i.test(text)) questions.push(`${text} (${evidence(turn, input.speakers)})`);
      if (/\b(risk|blocker|blocked|concern|dependency)\b/i.test(text)) risks.push(`${text} (${evidence(turn, input.speakers)})`);
      if (/\b(follow up|follow-up|revisit|next meeting)\b/i.test(text)) followUps.push(`${text} (${evidence(turn, input.speakers)})`);
      const actionMatch = text.match(/^(?:I(?:'ll| will| need to)|Let me|Action(?: item)?[: -])\s*(.+)$/i);
      if (actionMatch) actions.push({ owner, action: actionMatch[1].trim(), due: "Not specified", evidence: evidence(turn, input.speakers) });
      else if (/^(?:we|someone|the team) (?:should|need to|must)\b/i.test(text)) {
        actions.push({ owner: "Unassigned", action: text, due: "Not specified", evidence: evidence(turn, input.speakers) });
      }
      if (lower.includes("next step") && !followUps.some((item) => item.startsWith(text))) followUps.push(`${text} (${evidence(turn, input.speakers)})`);
    }

    const summaryTurns = input.turns.slice(0, 3).map((turn) => turn.text.trim()).filter(Boolean);
    const summary = summaryTurns.length ? summaryTurns.join(" ") : "No summary available.";
    const actionRows = actions.length
      ? actions.map((item) => `| ${escapeCell(item.owner)} | ${escapeCell(item.action)} | ${item.due} | ${item.evidence} |`).join("\n")
      : "| Unassigned | None identified | Not specified | — |";
    const generatedAt = new Date().toISOString();
    return { markdown: `# Meeting Note\n\n## Summary\n\n${summary}\n\n## Key Decisions\n\n${bulletLines(decisions)}\n\n## Action Items\n\n| Owner | Action | Due Date | Evidence |\n| --- | --- | --- | --- |\n${actionRows}\n\n## Open Questions\n\n${bulletLines(questions)}\n\n## Risks / Blockers\n\n${bulletLines(risks)}\n\n## Follow-up Topics\n\n${bulletLines(followUps)}\n\n## Source\n\n- Transcript: final-transcript.json\n- Generated at: ${generatedAt}\n` };
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function parseFinalTranscript(contents: string, meetingId: string): FinalTranscriptTurn[] {
  let raw: unknown;
  try { raw = JSON.parse(contents); }
  catch { throw new Error("Final transcript is invalid."); }
  const transcript = raw as { schemaVersion?: unknown; meetingId?: unknown; turns?: unknown };
  if (!raw || typeof raw !== "object" || transcript.schemaVersion !== 1 || transcript.meetingId !== meetingId || !Array.isArray(transcript.turns)) {
    throw new Error("Final transcript is invalid.");
  }
  for (const candidate of transcript.turns) {
    const turn = candidate as Partial<FinalTranscriptTurn>;
    if (!candidate || typeof candidate !== "object" || typeof turn.id !== "string" || turn.meetingId !== meetingId ||
      typeof turn.speakerId !== "string" || (turn.speakerName !== null && typeof turn.speakerName !== "string") ||
      typeof turn.start !== "number" || !Number.isFinite(turn.start) || turn.start < 0 ||
      typeof turn.end !== "number" || !Number.isFinite(turn.end) || turn.end < turn.start ||
      typeof turn.text !== "string" || turn.isFinal !== true) throw new Error("Final transcript is invalid.");
  }
  return transcript.turns as FinalTranscriptTurn[];
}

async function atomicWrite(target: string, markdown: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, markdown, { flag: "wx", encoding: "utf8" });
  try { await rename(temporary, target); }
  catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
}

export class MeetingNoteService {
  constructor(private readonly root: string, private readonly summarizer: MeetingNoteSummarizer = new TemplateMeetingNoteSummarizer()) {}

  async get(meetingId: string): Promise<MeetingNoteView | null> {
    const folder = await meetingFolder(this.root, meetingId);
    try {
      const markdown = await readFile(path.join(folder, "meeting-note.md"), "utf8");
      return { meetingId, status: "completed", source: "final-transcript.json", markdown };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("Meeting note could not be read.");
    }
  }

  async generate(meetingId: string, overwrite = false): Promise<MeetingNoteView> {
    const folder = await meetingFolder(this.root, meetingId);
    const target = path.join(folder, "meeting-note.md");
    if (!overwrite) {
      try { await readFile(target, "utf8"); throw new Error("Meeting note already exists. Use regenerate to replace it."); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    let contents: string;
    try { contents = await readFile(path.join(folder, "final-transcript.json"), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Final transcript is required to generate a meeting note.");
      throw new Error("Final transcript could not be read.");
    }
    const turns = parseFinalTranscript(contents, meetingId)
      .filter((turn) => turn.text.trim())
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
    if (!turns.length) throw new Error("Final transcript contains no dialogue to summarize.");
    const speakers = (await getSpeakers(this.root, meetingId)).speakers;
    const dialogue = buildMeetingDialogue(turns, speakers);
    if (dialogue.length > MAX_DIALOGUE_CHARACTERS) throw new Error("Final transcript is too long to summarize safely. Split it into a shorter meeting first.");
    let result: MeetingNoteResult;
    try { result = await this.summarizer.generateNote({ meetingId, source: "final-transcript.json", turns, speakers, dialogue }); }
    catch { throw new Error("Meeting note summarizer is unavailable."); }
    if (!REQUIRED_SECTIONS.every((section) => result.markdown.includes(`## ${section}`))) throw new Error("The summarizer returned an incomplete meeting note.");
    try { await atomicWrite(target, result.markdown); }
    catch { throw new Error("Meeting note could not be saved."); }
    return { meetingId, status: "completed", source: "final-transcript.json", markdown: result.markdown };
  }
}
