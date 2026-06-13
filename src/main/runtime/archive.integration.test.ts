import { mkdtemp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { extractZipSafely } from "./archive";

const archivePath = process.env.FFMPEG_TEST_ARCHIVE;
const archiveAvailable = Boolean(archivePath && existsSync(archivePath));
const roots: string[] = [];

describe.skipIf(!archiveAvailable)("FFmpeg archive integration", () => {
  afterAll(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("extracts the expected executables from the pinned archive", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ffmpeg-extract-integration-"));
    roots.push(root);
    const destinationPath = path.join(root, "ffmpeg");

    await extractZipSafely({
      archivePath: archivePath!,
      destinationPath,
      expectedFiles: ["ffmpeg.exe", "ffprobe.exe"],
      tempRoot: root
    });

    expect((await stat(path.join(destinationPath, "ffmpeg.exe"))).isFile()).toBe(true);
    expect((await stat(path.join(destinationPath, "ffprobe.exe"))).isFile()).toBe(true);
  }, 60_000);
});
