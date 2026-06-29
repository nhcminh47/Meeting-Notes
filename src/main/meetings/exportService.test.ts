import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExportService } from "./exportService";

const roots: string[] = [];
const meetingId = "mtg_export_test";
const turns = [
  { id: "turn_2", meetingId, speakerId: "SPEAKER_02", speakerName: "Old John", start: 19.2, end: 25.6, text: "Agreed, but we still need a final transcript after the meeting.", language: "en", source: "final", isFinal: true, confidence: null },
  { id: "turn_1", meetingId, speakerId: "SPEAKER_01", speakerName: null, start: 12.4, end: 18.9, text: "I think we should prioritize English live meetings first.", language: "en", source: "final", isFinal: true, confidence: 0.96 }
] as const;

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(options: { final?: boolean; note?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "meeting-export-"));
  roots.push(root);
  const folder = path.join(root, meetingId);
  await mkdir(folder);
  await writeFile(path.join(folder, "metadata.json"), JSON.stringify({ schemaVersion: 1, id: meetingId, title: "Product roadmap sync", language: "en" }, null, 2) + "\n");
  await writeFile(path.join(folder, "live-transcript.jsonl"), JSON.stringify({ type: "turn_final", text: "LIVE SECRET", apiKey: "synthetic-live-token" }) + "\n");
  await writeFile(path.join(folder, "speakers.json"), JSON.stringify({ schemaVersion: 1, meetingId, speakers: [
    { id: "SPEAKER_01", label: "Speaker 1", name: "Minh", source: "manual" },
    { id: "SPEAKER_02", label: "Speaker 2", name: "John", source: "manual" }
  ] }, null, 2) + "\n");
  if (options.final !== false) await writeFile(path.join(folder, "final-transcript.json"), JSON.stringify({ schemaVersion: 1, meetingId, language: "en", generatedAt: new Date().toISOString(), turns }, null, 2) + "\n");
  if (options.note !== false) await writeFile(path.join(folder, "meeting-note.md"), "# Meeting Note\n\n## Summary\n\nLocal note.\n");
  return { root, folder };
}

describe("meeting export service", () => {
  it("exports TXT from final transcript by default and respects renamed speakers", async () => {
    const { root, folder } = await fixture();
    const result = await new ExportService(root).exportMeeting({ meetingId, formats: ["txt"] });
    expect(result).toEqual({ ok: true, files: [{ format: "txt", path: "exports/transcript.txt" }] });
    const text = await readFile(path.join(folder, "exports", "transcript.txt"), "utf8");
    expect(text).toContain("[00:00:12] Minh: I think we should prioritize English live meetings first.");
    expect(text).toContain("[00:00:19] John: Agreed");
    expect(text).not.toContain("LIVE SECRET");
  });

  it("exports normalized JSON with metadata and turns", async () => {
    const { root, folder } = await fixture();
    await new ExportService(root).exportMeeting({ meetingId, formats: ["json"] });
    const exported = JSON.parse(await readFile(path.join(folder, "exports", "transcript.json"), "utf8"));
    expect(exported).toMatchObject({
      schemaVersion: 1,
      meetingId,
      title: "Product roadmap sync",
      language: "en",
      source: "final-transcript.json"
    });
    expect(exported.exportedAt).toEqual(expect.any(String));
    expect(exported.speakers).toContainEqual({ id: "SPEAKER_01", label: "Speaker 1", name: "Minh" });
    expect(exported.turns).toHaveLength(2);
  });

  it("exports valid SRT and VTT cue formats", async () => {
    const { root, folder } = await fixture();
    await new ExportService(root).exportMeeting({ meetingId, formats: ["srt", "vtt"] });
    expect(await readFile(path.join(folder, "exports", "transcript.srt"), "utf8")).toContain("00:00:12,400 --> 00:00:18,900");
    expect(await readFile(path.join(folder, "exports", "transcript.vtt"), "utf8")).toMatch(/^WEBVTT\n\n00:00:12\.400 --> 00:00:18\.900/);
  });

  it("copies meeting-note.md without regenerating it", async () => {
    const { root, folder } = await fixture();
    await new ExportService(root).exportMeeting({ meetingId, formats: ["md"] });
    expect(await readFile(path.join(folder, "exports", "meeting-note.md"), "utf8")).toBe("# Meeting Note\n\n## Summary\n\nLocal note.\n");
  });

  it("returns safe errors for missing note, missing final transcript, unsupported format, and traversal IDs", async () => {
    const missingNote = await fixture({ note: false });
    await expect(new ExportService(missingNote.root).exportMeeting({ meetingId, formats: ["md"] })).rejects.toThrow("Meeting note is required");
    const missingFinal = await fixture({ final: false });
    await expect(new ExportService(missingFinal.root).exportMeeting({ meetingId, formats: ["txt"] })).rejects.toThrow("Final transcript is required");
    const valid = await fixture();
    await expect(new ExportService(valid.root).exportMeeting({ meetingId, formats: ["zip" as "txt"] })).rejects.toThrow("Unsupported export format");
    await expect(new ExportService(valid.root).exportMeeting({ meetingId: "../secret", formats: ["txt"] })).rejects.toThrow("Invalid meeting ID");
  });

  it("does not mutate source files and writes only under exports", async () => {
    const { root, folder } = await fixture();
    const finalBefore = await readFile(path.join(folder, "final-transcript.json"), "utf8");
    const liveBefore = await readFile(path.join(folder, "live-transcript.jsonl"), "utf8");
    const noteBefore = await readFile(path.join(folder, "meeting-note.md"), "utf8");
    const result = await new ExportService(root).exportMeeting({ meetingId, formats: ["txt", "json", "srt", "vtt", "md"] });
    expect(result.files.every((file) => file.path.startsWith("exports/"))).toBe(true);
    expect(result.files.map((file) => file.path).join("\n")).not.toMatch(/sk-|secret|http/i);
    expect(await readFile(path.join(folder, "final-transcript.json"), "utf8")).toBe(finalBefore);
    expect(await readFile(path.join(folder, "live-transcript.jsonl"), "utf8")).toBe(liveBefore);
    expect(await readFile(path.join(folder, "meeting-note.md"), "utf8")).toBe(noteBefore);
  });
});
