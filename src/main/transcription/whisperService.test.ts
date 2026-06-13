import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paths = vi.hoisted(() => ({
  whisper: "",
  small: "",
  medium: "",
  workRoot: ""
}));
const runProcess = vi.hoisted(() => vi.fn());

vi.mock("../runtime/runtimeManager", () => ({
  getRuntimeExecutablePaths: () => ({
    ffmpegExe: "",
    whisperExe: paths.whisper,
    modelSmall: paths.small,
    modelMedium: paths.medium
  })
}));
vi.mock("../runtime/runtimePaths", () => ({
  createWorkPaths: () => ({
    jobRoot: paths.workRoot,
    wavPath: path.join(paths.workRoot, "audio.wav"),
    transcriptPrefix: path.join(paths.workRoot, "transcript")
  })
}));
vi.mock("../processRunner", () => ({ runProcess }));

import { transcribeAudioFile } from "./whisperService";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "whisper-service-test-"));
  paths.whisper = path.join(root, "whisper-cli.exe");
  paths.small = path.join(root, "small.bin");
  paths.medium = path.join(root, "medium.bin");
  paths.workRoot = path.join(root, "work");
  await Promise.all([
    writeFile(paths.whisper, "binary"),
    writeFile(paths.small, "model"),
    writeFile(paths.medium, "model")
  ]);
  runProcess.mockReset();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("transcribeAudioFile", () => {
  it("uses safe defaults and returns the generated text file", async () => {
    const audioPath = path.join(root, "audio.wav");
    await writeFile(audioPath, "wav");
    runProcess.mockImplementation(async (
      _executable: string,
      _args: string[],
      options: { onStderr?: (text: string) => void }
    ) => {
      options.onStderr?.("whisper_print_progress_callback: progress = 42%\n");
      await mkdir(paths.workRoot, { recursive: true });
      await writeFile(path.join(paths.workRoot, "transcript.txt"), "Xin chao");
      return { stdout: "", stderr: "" };
    });

    const progress = vi.fn();
    const result = await transcribeAudioFile({ audioPath, cpuThreads: 8, onProgress: progress });
    expect(result.text).toBe("Xin chao");
    expect(runProcess).toHaveBeenCalledWith(
      paths.whisper,
      [
        "-m",
        paths.small,
        "-f",
        audioPath,
        "-l",
        "vi",
        "-t",
        "8",
        "-pp",
        "-of",
        path.join(paths.workRoot, "transcript"),
        "-otxt"
      ],
      expect.objectContaining({ cwd: root })
    );
    expect(progress).toHaveBeenCalledWith(42);
  });

  it("requires the optional medium model before spawning", async () => {
    await rm(paths.medium);
    const audioPath = path.join(root, "audio.wav");
    await writeFile(audioPath, "wav");

    await expect(transcribeAudioFile({ audioPath, model: "medium" })).rejects.toThrow(
      "medium model does not exist"
    );
    expect(runProcess).not.toHaveBeenCalled();
  });
});
