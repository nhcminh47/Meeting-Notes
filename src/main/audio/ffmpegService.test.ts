import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paths = vi.hoisted(() => ({ ffmpeg: "" }));
const runProcess = vi.hoisted(() => vi.fn());

vi.mock("../runtime/runtimeManager", () => ({
  getRuntimeExecutablePaths: () => ({
    ffmpegExe: paths.ffmpeg,
    whisperExe: "",
    modelSmall: "",
    modelMedium: ""
  })
}));
vi.mock("../processRunner", () => ({ runProcess }));

import { convertToWav16kMono } from "./ffmpegService";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "ffmpeg-service-test-"));
  paths.ffmpeg = path.join(root, "ffmpeg.exe");
  await writeFile(paths.ffmpeg, "binary");
  runProcess.mockReset();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("convertToWav16kMono", () => {
  it("uses fixed 16 kHz mono PCM arguments and validates output", async () => {
    const inputPath = path.join(root, "source.mp3");
    const outputPath = path.join(root, "work", "audio.wav");
    await writeFile(inputPath, "audio");
    runProcess.mockImplementation(async () => {
      await writeFile(outputPath, "wav");
      return { stdout: "", stderr: "" };
    });

    await expect(convertToWav16kMono({ inputPath, outputPath })).resolves.toEqual({
      outputPath
    });
    expect(runProcess).toHaveBeenCalledWith(
      paths.ffmpeg,
      ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outputPath],
      { cwd: root }
    );
  });

  it("fails when the process does not create output", async () => {
    const inputPath = path.join(root, "source.mp3");
    await writeFile(inputPath, "audio");
    runProcess.mockResolvedValue({ stdout: "", stderr: "" });

    await expect(
      convertToWav16kMono({ inputPath, outputPath: path.join(root, "missing.wav") })
    ).rejects.toThrow("Converted WAV does not exist");
  });
});
