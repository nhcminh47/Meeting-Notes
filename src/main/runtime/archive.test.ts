import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findExpectedFileDirectories,
  selectRuntimeArchiveEntries,
  validateArchiveEntryPath
} from "./archive";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("archive validation", () => {
  it.each(["../escape.exe", "bin/../../escape.exe", "/absolute.exe", "C:\\escape.exe"])(
    "rejects unsafe entry %s",
    (entry) => {
      expect(() => validateArchiveEntryPath(entry)).toThrow("Unsafe archive entry");
    }
  );

  it("accepts normal nested entries", () => {
    expect(() => validateArchiveEntryPath("package/bin/ffmpeg.exe")).not.toThrow();
  });

  it("detects duplicate directories containing all expected files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "whisper-archive-test-"));
    tempDirectories.push(root);
    for (const folder of ["first", "second"]) {
      const directory = path.join(root, folder);
      await mkdir(directory);
      await writeFile(path.join(directory, "tool.exe"), "");
      await writeFile(path.join(directory, "tool.dll"), "");
    }

    const candidates = await findExpectedFileDirectories(root, ["tool.exe", "tool.dll"]);
    expect(candidates).toHaveLength(2);
  });

  it("selects only executable dependencies from the expected directory", () => {
    const entries = [
      { fileName: "package/LICENSE.txt", externalFileAttributes: 0 },
      { fileName: "package/bin/ffplay.exe", externalFileAttributes: 0 },
      { fileName: "package/bin/ffprobe.exe", externalFileAttributes: 0 },
      { fileName: "package/bin/ffmpeg.exe", externalFileAttributes: 0 },
      { fileName: "package/bin/runtime.dll", externalFileAttributes: 0 },
      { fileName: "package/doc/ffmpeg.html", externalFileAttributes: 0 }
    ];

    expect(
      selectRuntimeArchiveEntries(entries, ["ffmpeg.exe", "ffprobe.exe"])
    ).toEqual({
      candidateDirectory: "package/bin",
      files: [
        "package/bin/ffprobe.exe",
        "package/bin/ffmpeg.exe",
        "package/bin/runtime.dll"
      ]
    });
  });

  it("rejects archive listings with duplicate candidate directories", () => {
    const entries = ["a/ffmpeg.exe", "a/ffprobe.exe", "b/ffmpeg.exe", "b/ffprobe.exe"].map(
      (fileName) => ({ fileName, externalFileAttributes: 0 })
    );
    expect(() =>
      selectRuntimeArchiveEntries(entries, ["ffmpeg.exe", "ffprobe.exe"])
    ).toThrow("exactly one directory");
  });
});
