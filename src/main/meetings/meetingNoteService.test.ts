import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMeetingDialogue, MeetingNoteService, TemplateMeetingNoteSummarizer, type FinalTranscriptTurn } from "./meetingNoteService";

const roots: string[] = [];
const meetingId = "mtg_note_test";
const turns: FinalTranscriptTurn[] = [
  { id: "turn_2", meetingId, speakerId: "SPEAKER_02", speakerName: "Old Bob", start: 18, end: 22, text: "Agreed. We will ship the English mode.", isFinal: true },
  { id: "turn_1", meetingId, speakerId: "SPEAKER_01", speakerName: null, start: 12, end: 17, text: "I'll prepare the release checklist.", isFinal: true }
];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(options: { final?: boolean; speakers?: boolean } = { final: true, speakers: true }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "meeting-note-"));
  roots.push(root);
  const folder = path.join(root, meetingId);
  await mkdir(folder);
  await writeFile(path.join(folder, "metadata.json"), "{}\n");
  await writeFile(path.join(folder, "live-transcript.jsonl"), JSON.stringify({ type: "turn_final", text: "LIVE SECRET" }) + "\n");
  if (options.final !== false) await writeFile(path.join(folder, "final-transcript.json"), JSON.stringify({ schemaVersion: 1, meetingId, language: "en", generatedAt: new Date().toISOString(), turns }, null, 2) + "\n");
  if (options.speakers !== false) await writeFile(path.join(folder, "speakers.json"), JSON.stringify({ schemaVersion: 1, meetingId, speakers: [
    { id: "SPEAKER_01", label: "Speaker 1", name: "Minh", source: "manual" },
    { id: "SPEAKER_02", label: "Speaker 2", name: null, source: "final" }
  ] }, null, 2) + "\n");
  return { root, folder };
}

describe("meeting note generation", () => {
  it("builds ordered dialogue with renamed and fallback speaker names", () => {
    expect(buildMeetingDialogue(turns, [
      { id: "SPEAKER_01", label: "Speaker 1", name: "Minh" },
      { id: "SPEAKER_02", label: "Speaker 2", name: null }
    ])).toBe("[00:00:12] Minh: I'll prepare the release checklist.\n[00:00:18] Speaker 2: Agreed. We will ship the English mode.");
  });

  it("uses only final transcript, writes required sections, preserves owner, and does not mutate sources", async () => {
    const { root, folder } = await fixture();
    const finalBefore = await readFile(path.join(folder, "final-transcript.json"), "utf8");
    const liveBefore = await readFile(path.join(folder, "live-transcript.jsonl"), "utf8");
    const result = await new MeetingNoteService(root).generate(meetingId);
    expect(result.markdown).toContain("| Minh | prepare the release checklist.");
    expect(result.markdown).not.toContain("LIVE SECRET");
    for (const section of ["Summary", "Key Decisions", "Action Items", "Open Questions", "Risks / Blockers", "Follow-up Topics"]) expect(result.markdown).toContain(`## ${section}`);
    expect(await readFile(path.join(folder, "meeting-note.md"), "utf8")).toBe(result.markdown);
    expect(await readFile(path.join(folder, "final-transcript.json"), "utf8")).toBe(finalBefore);
    expect(await readFile(path.join(folder, "live-transcript.jsonl"), "utf8")).toBe(liveBefore);
  });

  it("does not fall back to live transcript when final transcript is missing", async () => {
    const { root } = await fixture({ final: false, speakers: true });
    await expect(new MeetingNoteService(root).generate(meetingId)).rejects.toThrow("Final transcript is required");
  });

  it("returns safe errors for empty and invalid final transcripts", async () => {
    const { root, folder } = await fixture();
    await writeFile(path.join(folder, "final-transcript.json"), JSON.stringify({ schemaVersion: 1, meetingId, turns: [] }));
    await expect(new MeetingNoteService(root).generate(meetingId)).rejects.toThrow("contains no dialogue");
    await writeFile(path.join(folder, "final-transcript.json"), "not-json");
    await expect(new MeetingNoteService(root).generate(meetingId)).rejects.toThrow("Final transcript is invalid");
  });

  it("does not overwrite unless regenerate is explicitly requested", async () => {
    const { root } = await fixture();
    const service = new MeetingNoteService(root);
    await service.generate(meetingId);
    await expect(service.generate(meetingId)).rejects.toThrow("already exists");
    await expect(service.generate(meetingId, true)).resolves.toMatchObject({ status: "completed" });
  });

  it("requires no external provider configuration", async () => {
    const result = await new TemplateMeetingNoteSummarizer().generateNote({ meetingId, source: "final-transcript.json", turns, speakers: [], dialogue: "dialogue" });
    expect(result.markdown).toContain("# Meeting Note");
  });

  it("recovers safe fallback labels when speakers metadata is missing", async () => {
    const { root } = await fixture({ final: true, speakers: false });
    const result = await new MeetingNoteService(root).generate(meetingId);
    expect(result.markdown).toContain("| Speaker 1 | prepare the release checklist.");
  });
});
