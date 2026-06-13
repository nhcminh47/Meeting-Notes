import { dialog, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { stat } from "node:fs/promises";
import { z } from "zod";
import {
  ensureRequiredRuntime,
  getRuntimeStatus,
  installRuntimeItem,
  repairRuntime
} from "./runtime/runtimeManager";
import { convertToWav16kMono } from "./audio/ffmpegService";
import { transcribeAudioFile } from "./transcription/whisperService";
import { createWorkPaths } from "./runtime/runtimePaths";
import { getLogSnapshot, logError, logEvent } from "./eventLogger";
import {
  getTranscriptionJobStatus,
  pauseTranscriptionJob,
  resumeTranscriptionJob,
  startTranscriptionJob,
  stopTranscriptionJob
} from "./transcription/transcriptionJobManager";

const selectedAudioPaths = new Set<string>();
const managedAudioPaths = new Set<string>();

export const runtimeItemSchema = z.enum([
  "ffmpeg",
  "whisper",
  "model-small",
  "model-medium"
]);
export const convertAudioSchema = z.object({
  inputPath: z.string().min(1).max(32767)
});
export const transcribeAudioSchema = z.object({
  audioPath: z.string().min(1).max(32767),
  model: z.enum(["small", "medium"]).optional(),
  language: z.enum(["vi", "en", "auto"]).optional(),
  outputFormat: z.enum(["txt", "json", "srt"]).optional()
});
export const startTranscriptionJobSchema = z.object({
  inputPath: z.string().min(1).max(32767),
  model: z.enum(["small", "medium"]).optional(),
  language: z.enum(["vi", "en", "auto"]).optional(),
  outputFormat: z.enum(["txt", "json", "srt"]).optional(),
  cpuThreads: z.number().int().min(1).max(64).optional()
});
export const jobIdSchema = z.string().uuid();

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  ".wav",
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".opus",
  ".wma",
  ".mp4",
  ".mov",
  ".mkv",
  ".webm"
]);

async function assertAudioPath(filePath: string): Promise<void> {
  if (!ALLOWED_AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error("Unsupported audio file type.");
  }
  try {
    if (!(await stat(filePath)).isFile()) throw new Error();
  } catch {
    throw new Error("The selected audio file no longer exists.");
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle("diagnostics:get-events", async () => getLogSnapshot());
  ipcMain.handle("runtime:get-status", async () => getRuntimeStatus());
  ipcMain.handle("runtime:ensure-required", async () => ensureRequiredRuntime());
  ipcMain.handle("runtime:install-item", async (_event, itemId: unknown) => {
    return installRuntimeItem(runtimeItemSchema.parse(itemId));
  });
  ipcMain.handle("runtime:repair", async () => repairRuntime());

  ipcMain.handle("audio:pick-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Audio and video",
          extensions: [...ALLOWED_AUDIO_EXTENSIONS].map((extension) => extension.slice(1))
        }
      ]
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    const selectedPath = path.resolve(result.filePaths[0]);
    await assertAudioPath(selectedPath);
    selectedAudioPaths.add(selectedPath);
    logEvent("info", "ipc", "Audio file selected.", {
      name: path.basename(selectedPath),
      extension: path.extname(selectedPath).toLowerCase()
    });
    return { path: selectedPath, name: path.basename(selectedPath) };
  });

  ipcMain.handle("audio:convert-to-wav16k", async (_event, rawInput: unknown) => {
    try {
      const input = convertAudioSchema.parse(rawInput);
      const inputPath = path.resolve(input.inputPath);
      if (!selectedAudioPaths.has(inputPath)) {
        throw new Error("Select the audio file through the application first.");
      }
      await assertAudioPath(inputPath);
      const jobId = randomUUID();
      const { wavPath } = createWorkPaths(jobId);
      const result = await convertToWav16kMono({ inputPath, outputPath: wavPath });
      managedAudioPaths.add(path.resolve(result.outputPath));
      return { jobId, outputPath: result.outputPath };
    } catch (error) {
      logError("ipc", "Audio conversion request failed.", error);
      throw error;
    }
  });

  ipcMain.handle("transcribe:start", async (_event, rawInput: unknown) => {
    try {
      const input = startTranscriptionJobSchema.parse(rawInput);
      const inputPath = path.resolve(input.inputPath);
      if (!selectedAudioPaths.has(inputPath)) {
        throw new Error("Select the audio file through the application first.");
      }
      await assertAudioPath(inputPath);
      return startTranscriptionJob({ ...input, inputPath });
    } catch (error) {
      logError("ipc", "Starting transcription job failed.", error);
      throw error;
    }
  });
  ipcMain.handle("transcribe:get-status", async (_event, jobId: unknown) =>
    getTranscriptionJobStatus(jobIdSchema.parse(jobId))
  );
  ipcMain.handle("transcribe:pause", async (_event, jobId: unknown) =>
    pauseTranscriptionJob(jobIdSchema.parse(jobId))
  );
  ipcMain.handle("transcribe:resume", async (_event, jobId: unknown) =>
    resumeTranscriptionJob(jobIdSchema.parse(jobId))
  );
  ipcMain.handle("transcribe:stop", async (_event, jobId: unknown) =>
    stopTranscriptionJob(jobIdSchema.parse(jobId))
  );

  ipcMain.handle("transcribe:audio-file", async (_event, rawInput: unknown) => {
    try {
      const input = transcribeAudioSchema.parse(rawInput);
      const audioPath = path.resolve(input.audioPath);
      if (!managedAudioPaths.has(audioPath)) {
        throw new Error("Only audio converted by this application can be transcribed.");
      }
      if (path.extname(audioPath).toLowerCase() !== ".wav") {
        throw new Error("Transcription input must be a WAV file.");
      }
      return await transcribeAudioFile({ ...input, audioPath });
    } catch (error) {
      logError("ipc", "Transcription request failed.", error);
      throw error;
    }
  });
}
