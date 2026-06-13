import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  flushEventLog,
  getLogSnapshot,
  logError,
  logEvent,
  setEventLogRoot
} from "./eventLogger";

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("event logger", () => {
  it("stores structured events in memory and JSONL", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "whisper-event-log-test-"));
    roots.push(root);
    setEventLogRoot(root);

    const info = logEvent("info", "test", "Started.", { count: 2 });
    const failure = logError("test", "Failed.", new Error("example failure"));
    await flushEventLog();

    const snapshot = getLogSnapshot();
    expect(snapshot.events).toEqual(expect.arrayContaining([info, failure]));
    expect(snapshot.logFilePath).toBe(path.join(root, "logs", "events.jsonl"));
    const persisted = await readFile(snapshot.logFilePath, "utf8");
    expect(persisted).toContain('"message":"Started."');
    expect(persisted).toContain('"error":"example failure"');
  });
});
