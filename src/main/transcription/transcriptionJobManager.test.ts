import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  root: "",
  convert: vi.fn(),
  transcribe: vi.fn()
}));

vi.mock("../runtime/runtimePaths", () => ({
  createWorkPaths: (jobId: string) => {
    const jobRoot = path.join(mocks.root, jobId);
    return {
      jobRoot,
      wavPath: path.join(jobRoot, "audio.wav"),
      transcriptPrefix: path.join(jobRoot, "transcript")
    };
  }
}));
vi.mock("../audio/ffmpegService", () => ({
  convertToWav16kMono: mocks.convert
}));
vi.mock("./whisperService", () => ({
  transcribeAudioFile: mocks.transcribe
}));

import {
  getTranscriptionJobStatus,
  pauseTranscriptionJob,
  resumeTranscriptionJob,
  startTranscriptionJob
} from "./transcriptionJobManager";

const roots: string[] = [];

async function waitForState(
  jobId: string,
  state: ReturnType<typeof getTranscriptionJobStatus>["state"]
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = getTranscriptionJobStatus(jobId);
    if (status.state === state) return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Job did not reach ${state}.`);
}

beforeEach(async () => {
  mocks.root = await mkdtemp(path.join(os.tmpdir(), "whisper-job-test-"));
  roots.push(mocks.root);
  mocks.convert.mockReset();
  mocks.transcribe.mockReset();
});

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("transcription job manager", () => {
  it("reports phase progress and completion", async () => {
    mocks.convert.mockImplementation(async ({ outputPath }: { outputPath: string }) => {
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, "wav");
      return { outputPath };
    });
    mocks.transcribe.mockResolvedValue({
      text: "Completed text",
      outputFiles: [path.join(mocks.root, "transcript.txt")]
    });

    const started = startTranscriptionJob({ inputPath: "C:\\input.mp3" });
    const completed = await waitForState(started.jobId, "completed");
    expect(completed.progress).toBe(100);
    expect(completed.phase).toBe("Transcription complete");
    expect(completed.result?.text).toBe("Completed text");
  });

  it("pauses transcription and resumes without repeating completed conversion", async () => {
    mocks.convert.mockImplementation(async ({ outputPath }: { outputPath: string }) => {
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, "wav");
      return { outputPath };
    });
    mocks.transcribe
      .mockImplementationOnce(
        async ({
          signal,
          onProgress
        }: {
          signal: AbortSignal;
          onProgress: (progress: number) => void;
        }) =>
          new Promise((_resolve, reject) => {
            onProgress(50);
            signal.addEventListener(
              "abort",
              () => {
                const error = new Error("cancelled");
                error.name = "AbortError";
                reject(error);
              },
              { once: true }
            );
          })
      )
      .mockResolvedValueOnce({ text: "Resumed", outputFiles: ["transcript.txt"] });

    const started = startTranscriptionJob({ inputPath: "C:\\input.mp3" });
    await waitForState(started.jobId, "transcribing");
    expect(getTranscriptionJobStatus(started.jobId).progress).toBe(67);
    expect(getTranscriptionJobStatus(started.jobId).phase).toContain("(50%)");
    const paused = await pauseTranscriptionJob(started.jobId);
    expect(paused.state).toBe("paused");
    expect(paused.canResume).toBe(true);

    resumeTranscriptionJob(started.jobId);
    const completed = await waitForState(started.jobId, "completed");
    expect(completed.result?.text).toBe("Resumed");
    expect(mocks.convert).toHaveBeenCalledTimes(1);
    expect(mocks.transcribe).toHaveBeenCalledTimes(2);
  });
});
