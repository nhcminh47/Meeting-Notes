import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  ensureRequiredRuntime,
  getRuntimeStatus,
  installRuntimeItem,
  repairRuntime
} from "./runtime/runtimeManager";
import { convertToWav16kMono } from "./audio/ffmpegService";
import { transcribeAudioFile } from "./transcription/whisperService";
import { createRecordingPaths, createWorkPaths } from "./runtime/runtimePaths";
import { getLogSnapshot, logError, logEvent } from "./eventLogger";
import {
  cancelLiveTranscriptSession,
  enqueueLiveTranscriptChunk,
  finishLiveTranscriptSession,
  startLiveTranscriptSession
} from "./transcription/liveTranscriptSessionManager";
import {
  getTranscriptionJobStatus,
  pauseTranscriptionJob,
  resumeTranscriptionJob,
  startTranscriptionJob,
  stopTranscriptionJob
} from "./transcription/transcriptionJobManager";
import { remoteSettingsService } from "./remote/remoteSettings";
import { RemoteLiveSession } from "./remote/remoteLiveSession";
import { clearSpeakerName, getSpeakers, renameSpeaker } from "./meetings/speakerStore";
import { MeetingNoteService } from "./meetings/meetingNoteService";

const selectedAudioPaths = new Set<string>();
const managedAudioPaths = new Set<string>();
const recordingAudioPaths = new Set<string>();
const discardableRecordingPaths = new Set<string>();
const MAX_RECORDING_BYTES = 512 * 1024 * 1024;

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
  cpuThreads: z.number().int().min(1).max(64).optional(),
  debugMode: z.boolean().optional()
});
export const jobIdSchema = z.string().uuid();
export const saveRecordingSchema = z.object({
  data: z.instanceof(Uint8Array),
  mimeType: z.string().min(1).max(120),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000)
});
export const recordingPathSchema = z.string().min(1).max(32767);
export const recordingEventSchema = z.object({
  event: z.enum([
    "permission-granted",
    "permission-denied",
    "started",
    "stopped",
    "transcribe-requested",
    "error"
  ]),
  mimeType: z.string().max(120).optional(),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  message: z.string().max(500).optional()
});
export const startLiveTranscriptSessionSchema = z.object({
  model: z.enum(["small", "medium"]).optional(),
  language: z.enum(["vi", "en", "auto"]).optional(),
  cpuThreads: z.number().int().min(1).max(64).optional(),
  debugMode: z.boolean().optional()
});
export const liveTranscriptChunkSchema = z.object({
  sessionId: z.string().uuid(),
  chunkIndex: z.number().int().min(0).max(100000),
  data: z.instanceof(Uint8Array),
  mimeType: z.string().min(1).max(120),
  durationMs: z.number().int().min(0).max(10 * 60 * 1000),
  isFinal: z.boolean().optional()
});
export const finishLiveTranscriptSessionSchema = z.object({
  sessionId: z.string().uuid(),
  finalText: z.string().max(5_000_000),
  saveTranscript: z.boolean().optional()
});
export const remoteSettingsInputSchema = z.object({
  serverUrl: z.string().max(2048).optional(),
  apiKey: z.string().max(4096).optional()
});
export const remoteLiveAudioSchema = z.instanceof(Uint8Array).refine(
  (chunk) => chunk.byteLength > 0 && chunk.byteLength <= 32000,
  "Live audio chunks must contain at most one second of PCM."
);
export const speakerMeetingSchema = z.object({ meetingId: z.string().regex(/^mtg_[A-Za-z0-9_-]+$/).max(128) }).strict();
export const speakerMutationSchema = speakerMeetingSchema.extend({
  speakerId: z.string().min(1).max(32)
});
export const speakerRenameSchema = speakerMutationSchema.extend({
  name: z.string().max(256)
});
export const meetingNoteSchema = speakerMeetingSchema;

function meetingsRoot(): string {
  return path.join(app.getPath("userData"), "meetings");
}

const remoteLiveSession = new RemoteLiveSession((payload) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("live-meeting:event", payload);
  }
});

export async function stopRemoteLiveMeeting(): Promise<void> {
  await remoteLiveSession.stop();
}

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
const RECORDING_FORMATS = new Map([
  ["audio/wav", ".wav"],
  ["audio/wave", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/webm", ".webm"],
  ["audio/webm;codecs=opus", ".webm"],
  ["audio/ogg", ".ogg"],
  ["audio/ogg;codecs=opus", ".ogg"]
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

function getSenderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("The application window is no longer available.");
  return window;
}

export function registerIpcHandlers(): void {
  ipcMain.handle("window:minimize", (event) => {
    getSenderWindow(event).minimize();
  });
  ipcMain.handle("window:toggle-maximize", (event) => {
    const window = getSenderWindow(event);
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return window.isMaximized();
  });
  ipcMain.handle("window:is-maximized", (event) => {
    return getSenderWindow(event).isMaximized();
  });
  ipcMain.handle("window:close", (event) => {
    getSenderWindow(event).close();
  });

  ipcMain.handle("diagnostics:get-events", async () => getLogSnapshot());
  ipcMain.handle("remote-settings:get", async () => remoteSettingsService.get());
  ipcMain.handle("remote-settings:save", async (_event, input: unknown) =>
    remoteSettingsService.save(remoteSettingsInputSchema.parse(input))
  );
  ipcMain.handle("remote-settings:clear-api-key", async () =>
    remoteSettingsService.clearApiKey()
  );
  ipcMain.handle("remote-settings:clear-all", async () =>
    remoteSettingsService.clearAll()
  );
  ipcMain.handle("remote-settings:test-connection", async (_event, input: unknown) =>
    remoteSettingsService.testConnection(remoteSettingsInputSchema.parse(input))
  );
  ipcMain.handle("live-meeting:start", async () => remoteLiveSession.start());
  ipcMain.handle("live-meeting:send-audio", async (_event, chunk: unknown) =>
    remoteLiveSession.sendAudio(remoteLiveAudioSchema.parse(chunk))
  );
  ipcMain.handle("live-meeting:stop", async () => remoteLiveSession.stop());
  ipcMain.handle("live-meeting:get-status", async () => remoteLiveSession.getStatus());
  ipcMain.handle("speakers:get", async (_event, rawInput: unknown) => {
    const input = speakerMeetingSchema.parse(rawInput);
    return getSpeakers(meetingsRoot(), input.meetingId);
  });
  ipcMain.handle("speakers:rename", async (_event, rawInput: unknown) => {
    const input = speakerRenameSchema.parse(rawInput);
    return renameSpeaker(meetingsRoot(), input);
  });
  ipcMain.handle("speakers:clear-name", async (_event, rawInput: unknown) => {
    const input = speakerMutationSchema.parse(rawInput);
    return clearSpeakerName(meetingsRoot(), input);
  });
  ipcMain.handle("meeting-notes:get", async (_event, rawInput: unknown) => {
    const input = meetingNoteSchema.parse(rawInput);
    return new MeetingNoteService(meetingsRoot()).get(input.meetingId);
  });
  ipcMain.handle("meeting-notes:generate", async (_event, rawInput: unknown) => {
    const input = meetingNoteSchema.parse(rawInput);
    return new MeetingNoteService(meetingsRoot()).generate(input.meetingId);
  });
  ipcMain.handle("meeting-notes:regenerate", async (_event, rawInput: unknown) => {
    const input = meetingNoteSchema.parse(rawInput);
    return new MeetingNoteService(meetingsRoot()).generate(input.meetingId, true);
  });
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

  ipcMain.handle("audio:save-recording", async (_event, rawInput: unknown) => {
    try {
      const input = saveRecordingSchema.parse(rawInput);
      if (input.data.byteLength === 0) throw new Error("The recording is empty.");
      if (input.data.byteLength > MAX_RECORDING_BYTES) {
        throw new Error("The recording exceeds the 512 MB local limit.");
      }
      const normalizedMimeType = input.mimeType.toLowerCase().replace(/\s/g, "");
      const extension = RECORDING_FORMATS.get(normalizedMimeType);
      if (!extension) throw new Error("Unsupported recording format.");

      const { recordingRoot, recordingPath } = createRecordingPaths(
        randomUUID(),
        extension
      );
      await mkdir(recordingRoot, { recursive: true });
      await writeFile(recordingPath, input.data);
      const resolvedPath = path.resolve(recordingPath);
      selectedAudioPaths.add(resolvedPath);
      recordingAudioPaths.add(resolvedPath);
      discardableRecordingPaths.add(resolvedPath);
      logEvent("info", "recording", "Microphone recording saved locally.", {
        path: resolvedPath,
        format: normalizedMimeType,
        durationMs: input.durationMs,
        bytes: input.data.byteLength
      });
      return { path: resolvedPath, name: path.basename(resolvedPath) };
    } catch (error) {
      logError("recording", "Saving microphone recording failed.", error);
      throw error;
    }
  });

  ipcMain.handle("audio:keep-recording", async (_event, rawPath: unknown) => {
    const recordingPath = path.resolve(recordingPathSchema.parse(rawPath));
    if (!recordingAudioPaths.has(recordingPath)) {
      throw new Error("Only recordings created by this application can be retained.");
    }
    await assertAudioPath(recordingPath);
    discardableRecordingPaths.delete(recordingPath);
    logEvent("info", "recording", "Recording retained locally.", {
      path: recordingPath
    });
  });

  ipcMain.handle("audio:discard-recording", async (_event, rawPath: unknown) => {
    const recordingPath = path.resolve(recordingPathSchema.parse(rawPath));
    if (!discardableRecordingPaths.has(recordingPath)) {
      throw new Error("Only temporary recordings can be discarded.");
    }
    await rm(path.dirname(recordingPath), { recursive: true, force: true });
    selectedAudioPaths.delete(recordingPath);
    recordingAudioPaths.delete(recordingPath);
    discardableRecordingPaths.delete(recordingPath);
    logEvent("warn", "recording", "Microphone recording discarded.", {
      path: recordingPath
    });
  });

  ipcMain.handle("audio:report-recording-event", async (_event, rawInput: unknown) => {
    const input = recordingEventSchema.parse(rawInput);
    const level =
      input.event === "error" || input.event === "permission-denied" ? "error" : "info";
    const messages = {
      "permission-granted": "Microphone permission granted.",
      "permission-denied": "Microphone permission denied.",
      started: "Microphone recording started.",
      stopped: "Microphone recording stopped.",
      "transcribe-requested": "Recording queued for transcription.",
      error: "Microphone recording failed."
    } as const;
    logEvent(level, "recording", messages[input.event], {
      mimeType: input.mimeType ?? "",
      durationMs: input.durationMs ?? 0,
      message: input.message ?? ""
    });
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
      if (recordingAudioPaths.has(inputPath)) {
        logEvent("info", "recording", "Saved recording loaded for transcription.", {
          path: inputPath
        });
      }
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

  ipcMain.handle("live-transcript:start-session", async (_event, rawInput: unknown) => {
    return startLiveTranscriptSession(startLiveTranscriptSessionSchema.parse(rawInput));
  });

  ipcMain.handle("live-transcript:enqueue-chunk", async (_event, rawInput: unknown) => {
    return enqueueLiveTranscriptChunk(liveTranscriptChunkSchema.parse(rawInput));
  });

  ipcMain.handle("live-transcript:finish-session", async (_event, rawInput: unknown) => {
    return finishLiveTranscriptSession(
      finishLiveTranscriptSessionSchema.parse(rawInput)
    );
  });

  ipcMain.handle("live-transcript:cancel-session", async (_event, sessionId: unknown) => {
    await cancelLiveTranscriptSession(jobIdSchema.parse(sessionId));
  });
}
