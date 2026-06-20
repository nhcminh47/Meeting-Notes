import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendFinalTurn } from "./liveTranscriptWriter";

describe("appendFinalTurn", () => {
  it("ignores partials and newline-appends finalized turns", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "turn-writer-"));
    const target = path.join(folder, "live-transcript.jsonl");
    await writeFile(target, "");
    const base = { sessionId: "srv", turnId: "turn_001", speaker: "SPEAKER_01", start: 0, end: 1, text: "hello", source: "live" as const };
    await appendFinalTurn(folder, "mtg_local", { type: "partial", ...base, isFinal: false });
    expect(await readFile(target, "utf8")).toBe("");
    await appendFinalTurn(folder, "mtg_local", { type: "turn_final", ...base, isFinal: true });
    const saved = await readFile(target, "utf8");
    expect(saved.endsWith("\n")).toBe(true);
    expect(JSON.parse(saved)).toMatchObject({ meetingId: "mtg_local", speakerId: "SPEAKER_01", isFinal: true });
    await rm(folder, { recursive: true, force: true });
  });
});
