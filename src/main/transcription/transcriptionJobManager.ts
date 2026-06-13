import { randomUUID } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { convertToWav16kMono } from "../audio/ffmpegService";
import { logError, logEvent } from "../eventLogger";
import { createWorkPaths } from "../runtime/runtimePaths";
import { transcribeAudioFile } from "./whisperService";
import type {
  StartTranscriptionJobInput,
  TranscriptionJobStatus
} from "../../shared/apiTypes";

type InternalJob = {
  input: StartTranscriptionJobInput;
  status: TranscriptionJobStatus;
  wavPath: string;
  transcriptPrefix: string;
  conversionComplete: boolean;
  controller?: AbortController;
  runPromise?: Promise<void>;
  progressTimer?: NodeJS.Timeout;
};

const jobs = new Map<string, InternalJob>();

function publicStatus(job: InternalJob): TranscriptionJobStatus {
  return {
    ...job.status,
    result: job.status.result
      ? { ...job.status.result, outputFiles: [...job.status.result.outputFiles] }
      : undefined
  };
}

function updateControls(job: InternalJob): void {
  const active = job.status.state === "converting" || job.status.state === "transcribing";
  job.status.canPause = active;
  job.status.canResume = job.status.state === "paused";
  job.status.canStop = active || job.status.state === "paused" || job.status.state === "queued";
}

function setState(
  job: InternalJob,
  state: TranscriptionJobStatus["state"],
  phase: string,
  progress?: number
): void {
  job.status.state = state;
  job.status.phase = phase;
  if (progress !== undefined) job.status.progress = Math.max(job.status.progress, progress);
  updateControls(job);
}

function startProgress(job: InternalJob, ceiling: number, increment: number): void {
  if (job.progressTimer) clearInterval(job.progressTimer);
  job.progressTimer = setInterval(() => {
    if (job.status.progress < ceiling) {
      job.status.progress = Math.min(ceiling, job.status.progress + increment);
    }
  }, 1000);
}

function stopProgress(job: InternalJob): void {
  if (job.progressTimer) clearInterval(job.progressTimer);
  job.progressTimer = undefined;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function runJob(job: InternalJob): Promise<void> {
  const controller = new AbortController();
  job.controller = controller;
  job.status.error = undefined;

  try {
    if (!job.conversionComplete || !(await fileExists(job.wavPath))) {
      setState(job, "converting", "Converting audio to 16 kHz mono WAV", 8);
      startProgress(job, 30, 2);
      await convertToWav16kMono({
        inputPath: job.input.inputPath,
        outputPath: job.wavPath,
        signal: controller.signal
      });
      job.conversionComplete = true;
      stopProgress(job);
      job.status.progress = 32;
    }

    if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    setState(job, "transcribing", "Running local Whisper transcription", 35);
    stopProgress(job);
    const result = await transcribeAudioFile({
      audioPath: job.wavPath,
      model: job.input.model,
      language: job.input.language,
      outputFormat: job.input.outputFormat,
      cpuThreads: job.input.cpuThreads,
      outputPrefix: job.transcriptPrefix,
      signal: controller.signal,
      onProgress: (whisperProgress) => {
        if (job.status.state === "transcribing") {
          job.status.progress = Math.max(
            job.status.progress,
            Math.min(99, 35 + Math.round(whisperProgress * 0.64))
          );
          job.status.phase = `Running local Whisper transcription (${whisperProgress}%)`;
        }
      }
    });

    stopProgress(job);
    job.status.result = result;
    setState(job, "completed", "Transcription complete", 100);
    logEvent("info", "job", "Transcription job completed.", { jobId: job.status.jobId });
  } catch (error) {
    stopProgress(job);
    if (isAbort(error)) {
      if (job.status.state === "paused" || job.status.state === "stopped") return;
      setState(job, "stopped", "Stopped", job.status.progress);
      return;
    }
    job.status.error = error instanceof Error ? error.message : String(error);
    setState(job, "error", "Transcription failed", job.status.progress);
    logError("job", "Transcription job failed.", error, { jobId: job.status.jobId });
  } finally {
    if (job.controller === controller) job.controller = undefined;
  }
}

function beginRun(job: InternalJob): void {
  const promise = runJob(job);
  const trackedPromise = promise.finally(() => {
    if (job.runPromise === trackedPromise) job.runPromise = undefined;
  });
  job.runPromise = trackedPromise;
}

function getJob(jobId: string): InternalJob {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Unknown transcription job: ${jobId}`);
  return job;
}

export function startTranscriptionJob(
  input: StartTranscriptionJobInput
): TranscriptionJobStatus {
  if (jobs.size >= 50) {
    for (const [existingId, existingJob] of jobs) {
      if (["completed", "stopped", "error"].includes(existingJob.status.state)) {
        jobs.delete(existingId);
        break;
      }
    }
  }
  const jobId = randomUUID();
  const work = createWorkPaths(jobId);
  const job: InternalJob = {
    input,
    wavPath: work.wavPath,
    transcriptPrefix: work.transcriptPrefix,
    conversionComplete: false,
    status: {
      jobId,
      state: "queued",
      progress: 2,
      phase: "Preparing job",
      canPause: false,
      canResume: false,
      canStop: true
    }
  };
  jobs.set(jobId, job);
  logEvent("info", "job", "Transcription job started.", {
    jobId,
    model: input.model ?? "small",
    language: input.language ?? "vi",
    cpuThreads: input.cpuThreads ?? os.availableParallelism()
  });
  beginRun(job);
  return publicStatus(job);
}

export function getTranscriptionJobStatus(jobId: string): TranscriptionJobStatus {
  return publicStatus(getJob(jobId));
}

export async function pauseTranscriptionJob(jobId: string): Promise<TranscriptionJobStatus> {
  const job = getJob(jobId);
  if (!job.status.canPause) return publicStatus(job);
  setState(job, "paused", "Paused. Resume restarts the current phase.", job.status.progress);
  stopProgress(job);
  job.controller?.abort();
  await job.runPromise;
  logEvent("warn", "job", "Transcription job paused.", { jobId });
  return publicStatus(job);
}

export function resumeTranscriptionJob(jobId: string): TranscriptionJobStatus {
  const job = getJob(jobId);
  if (!job.status.canResume) return publicStatus(job);
  logEvent("info", "job", "Transcription job resumed.", { jobId });
  beginRun(job);
  return publicStatus(job);
}

export async function stopTranscriptionJob(jobId: string): Promise<TranscriptionJobStatus> {
  const job = getJob(jobId);
  if (!job.status.canStop) return publicStatus(job);
  setState(job, "stopped", "Stopped", job.status.progress);
  stopProgress(job);
  job.controller?.abort();
  await job.runPromise;
  await rm(path.dirname(job.wavPath), { recursive: true, force: true }).catch(() => undefined);
  logEvent("warn", "job", "Transcription job stopped.", { jobId });
  return publicStatus(job);
}
