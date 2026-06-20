import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearSpeakerName, getSpeakers, renameSpeaker } from "./speakerStore";

async function fixture(options: { speakers?: boolean; final?: boolean } = { speakers: true }) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "speaker-store-"));
  const root = path.join(temporary, "meetings");
  const meetingId = "mtg_20260621_test";
  const folder = path.join(root, meetingId);
  await mkdir(folder, { recursive: true });
  const speakerFile = {
    schemaVersion: 1,
    meetingId,
    speakers: [
      { id: "SPEAKER_01", label: "Speaker 1", name: null, source: "final" },
      { id: "UNKNOWN", label: "Unknown speaker", name: null, source: "final" }
    ]
  };
  if (options.speakers !== false) {
    await writeFile(path.join(folder, "speakers.json"), `${JSON.stringify(speakerFile, null, 2)}\n`);
  }
  if (options.final) {
    await writeFile(path.join(folder, "final-transcript.json"), JSON.stringify({
      schemaVersion: 1,
      meetingId,
      turns: [
        { id: "turn_1", speakerId: "SPEAKER_02", speakerName: null, text: "Hello" },
        { id: "turn_2", speakerId: "UNKNOWN", speakerName: null, text: "Hi" }
      ]
    }));
  }
  return { temporary, root, meetingId, folder, speakerFile };
}

describe("speaker store", () => {
  it("reads speakers.json", async () => {
    const item = await fixture();
    try { expect(await getSpeakers(item.root, item.meetingId)).toEqual(item.speakerFile); }
    finally { await rm(item.temporary, { recursive: true, force: true }); }
  });

  it("renames only the display name and leaves transcript files unchanged", async () => {
    const item = await fixture({ speakers: true, final: true });
    try {
      const transcriptPath = path.join(item.folder, "final-transcript.json");
      const before = await readFile(transcriptPath, "utf8");
      const result = await renameSpeaker(item.root, {
        meetingId: item.meetingId,
        speakerId: "SPEAKER_01",
        name: "  Minh  "
      });
      expect(result.speakers[0]).toEqual({ id: "SPEAKER_01", label: "Speaker 1", name: "Minh", source: "final" });
      expect(await readFile(transcriptPath, "utf8")).toBe(before);
      expect((await readdir(item.folder)).some((name) => name.endsWith(".tmp"))).toBe(false);
    } finally { await rm(item.temporary, { recursive: true, force: true }); }
  });

  it("clears a name explicitly or with empty input", async () => {
    const item = await fixture();
    try {
      await renameSpeaker(item.root, { meetingId: item.meetingId, speakerId: "SPEAKER_01", name: "Alex" });
      expect((await clearSpeakerName(item.root, { meetingId: item.meetingId, speakerId: "SPEAKER_01" })).speakers[0].name).toBeNull();
      await renameSpeaker(item.root, { meetingId: item.meetingId, speakerId: "SPEAKER_01", name: "Alex" });
      expect((await renameSpeaker(item.root, { meetingId: item.meetingId, speakerId: "SPEAKER_01", name: "   " })).speakers[0].name).toBeNull();
    } finally { await rm(item.temporary, { recursive: true, force: true }); }
  });

  it("accepts unicode display names", async () => {
    const item = await fixture();
    try {
      const file = await renameSpeaker(item.root, { meetingId: item.meetingId, speakerId: "SPEAKER_01", name: "Nguyễn Minh" });
      expect(file.speakers[0].name).toBe("Nguyễn Minh");
    } finally { await rm(item.temporary, { recursive: true, force: true }); }
  });

  it.each([
    ["too long", "x".repeat(81), "80 characters"],
    ["control characters", "Minh\n", "control characters"]
  ])("rejects %s in names", async (_case, name, message) => {
    const item = await fixture();
    try {
      await expect(renameSpeaker(item.root, { meetingId: item.meetingId, speakerId: "SPEAKER_01", name })).rejects.toThrow(message);
    } finally { await rm(item.temporary, { recursive: true, force: true }); }
  });

  it("rejects invalid speaker and unsafe meeting IDs", async () => {
    const item = await fixture();
    try {
      await expect(renameSpeaker(item.root, { meetingId: item.meetingId, speakerId: "../speaker", name: "Minh" })).rejects.toThrow("Invalid speaker ID");
      await expect(getSpeakers(item.root, "../outside")).rejects.toThrow("Invalid meeting ID");
      await expect(getSpeakers(item.root, "mtg_missing")).rejects.toThrow("Meeting does not exist");
    } finally { await rm(item.temporary, { recursive: true, force: true }); }
  });

  it("initializes missing speaker metadata from the final transcript", async () => {
    const item = await fixture({ speakers: false, final: true });
    try {
      const file = await getSpeakers(item.root, item.meetingId);
      expect(file.speakers).toEqual([
        { id: "SPEAKER_02", label: "Speaker 2", name: null, source: "final" },
        { id: "UNKNOWN", label: "Unknown speaker", name: null, source: "final" }
      ]);
      expect(JSON.parse(await readFile(path.join(item.folder, "speakers.json"), "utf8"))).toEqual(file);
    } finally { await rm(item.temporary, { recursive: true, force: true }); }
  });
});
