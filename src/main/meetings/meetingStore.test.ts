import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLiveMeeting } from "./meetingStore";

describe("createLiveMeeting", () => {
  it("creates local metadata, speakers, and an empty live transcript", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "meeting-store-"));
    const root = path.join(temporary, "meetings");
    try {
      const meeting = await createLiveMeeting(root, new Date("2026-06-21T01:02:03.000Z"));
      const metadata = JSON.parse(await readFile(path.join(meeting.folder, "metadata.json"), "utf8"));
      const speakers = JSON.parse(await readFile(path.join(meeting.folder, "speakers.json"), "utf8"));
      expect(metadata).toMatchObject({ language: "en", status: "recording", finalized: false });
      expect(metadata).not.toHaveProperty("apiKey");
      expect(speakers.speakers.map((speaker: { id: string }) => speaker.id)).toEqual(["SPEAKER_01", "UNKNOWN"]);
      expect(await readFile(path.join(meeting.folder, "live-transcript.jsonl"), "utf8")).toBe("");
    } finally { await rm(temporary, { recursive: true, force: true }); }
  });
});
