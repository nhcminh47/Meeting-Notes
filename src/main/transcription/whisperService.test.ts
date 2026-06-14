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

function wavWithDuration(seconds: number): Buffer {
  const sampleRate = 16_000;
  const dataSize = sampleRate * 2 * seconds;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

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
      return { stdout: "", stderr: "", exitCode: 0, durationMs: 10 };
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
        "-nth",
        "0.6",
        "-lpt",
        "-1",
        "-et",
        "2.4",
        "-tp",
        "0",
        "-tpi",
        "0.2",
        "-pp",
        "-of",
        path.join(paths.workRoot, "transcript"),
        "-otxt"
      ],
      expect.objectContaining({ cwd: root })
    );
    expect(progress).toHaveBeenCalledWith(42);
  });

  it.each([
    ["auto", "auto"],
    ["en", "en"],
    ["vi", "vi"]
  ] as const)("maps UI language %s to whisper language %s", async (language, expected) => {
    const audioPath = path.join(root, `${language}.wav`);
    await writeFile(audioPath, "wav");
    runProcess.mockImplementation(async (
      _executable: string,
      args: string[]
    ) => {
      await mkdir(paths.workRoot, { recursive: true });
      await writeFile(path.join(paths.workRoot, "transcript.txt"), "Transcript");
      expect(args.slice(args.indexOf("-l"), args.indexOf("-l") + 2)).toEqual([
        "-l",
        expected
      ]);
      expect(args).not.toContain("-tr");
      expect(args).not.toContain("--prompt");
      return { stdout: "", stderr: "", exitCode: 0, durationMs: 10 };
    });

    await transcribeAudioFile({ audioPath, language });
    expect(runProcess).toHaveBeenCalledTimes(1);
  });

  it("retries a suspiciously short English result without changing language", async () => {
    const audioPath = path.join(root, "short-english.wav");
    await writeFile(audioPath, wavWithDuration(20));
    runProcess
      .mockImplementationOnce(async (_executable: string, args: string[]) => {
        await mkdir(paths.workRoot, { recursive: true });
        await writeFile(path.join(paths.workRoot, "transcript.txt"), "Hi.");
        expect(args.slice(args.indexOf("-l"), args.indexOf("-l") + 2)).toEqual(["-l", "en"]);
        expect(args.slice(args.indexOf("-nth"), args.indexOf("-nth") + 2)).toEqual([
          "-nth",
          "0.6"
        ]);
        return { stdout: "", stderr: "", exitCode: 0, durationMs: 10 };
      })
      .mockImplementationOnce(async (_executable: string, args: string[]) => {
        await writeFile(
          path.join(paths.workRoot, "transcript.txt"),
          "Hi. This is the recovered continuation."
        );
        expect(args.slice(args.indexOf("-l"), args.indexOf("-l") + 2)).toEqual(["-l", "en"]);
        expect(args.slice(args.indexOf("-nth"), args.indexOf("-nth") + 2)).toEqual([
          "-nth",
          "0.8"
        ]);
        expect(args).not.toContain("-tr");
        return { stdout: "", stderr: "", exitCode: 0, durationMs: 12 };
      });

    const result = await transcribeAudioFile({ audioPath, language: "en" });

    expect(runProcess).toHaveBeenCalledTimes(2);
    expect(result.text).toContain("recovered continuation");
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
