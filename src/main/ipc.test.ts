import { describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  let maximized = false;
  const targetWindow = {
    minimize: vi.fn(),
    maximize: vi.fn(() => {
      maximized = true;
    }),
    unmaximize: vi.fn(() => {
      maximized = false;
    }),
    isMaximized: vi.fn(() => maximized),
    close: vi.fn()
  };
  return { handlers, targetWindow };
});

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => electronMocks.targetWindow)
  },
  dialog: {},
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      electronMocks.handlers.set(channel, handler);
    })
  }
}));

import {
  convertAudioSchema,
  finishLiveTranscriptSessionSchema,
  jobIdSchema,
  liveTranscriptChunkSchema,
  meetingNoteSchema,
  recordingEventSchema,
  registerIpcHandlers,
  runtimeItemSchema,
  saveRecordingSchema,
  startLiveTranscriptSessionSchema,
  startTranscriptionJobSchema,
  transcribeAudioSchema
} from "./ipc";

describe("IPC schemas", () => {
  it("only accepts allowlisted runtime item IDs", () => {
    expect(runtimeItemSchema.parse("model-medium")).toBe("model-medium");
    expect(() => runtimeItemSchema.parse("../../payload")).toThrow();
  });

  it("validates meeting note requests without accepting paths or credentials", () => {
    expect(meetingNoteSchema.parse({ meetingId: "mtg_valid_25" })).toEqual({ meetingId: "mtg_valid_25" });
    expect(() => meetingNoteSchema.parse({ meetingId: "../../secret", apiKey: "nope" })).toThrow();
  });

  it("rejects arbitrary transcription options", () => {
    expect(() =>
      transcribeAudioSchema.parse({
        audioPath: "C:\\audio.wav",
        model: "custom",
        language: "--help",
        outputFormat: "exe"
      })
    ).toThrow();
  });

  it("requires a concrete conversion input path", () => {
    expect(() => convertAudioSchema.parse({ inputPath: "" })).toThrow();
  });

  it("validates recording payloads and allowlisted lifecycle events", () => {
    expect(
      saveRecordingSchema.parse({
        data: new Uint8Array([1, 2, 3]),
        mimeType: "audio/webm;codecs=opus",
        durationMs: 1200
      })
    ).toMatchObject({ mimeType: "audio/webm;codecs=opus", durationMs: 1200 });
    expect(() =>
      recordingEventSchema.parse({ event: "arbitrary", message: "nope" })
    ).toThrow();
  });

  it("validates fixed transcription job inputs and UUID controls", () => {
    expect(
      startTranscriptionJobSchema.parse({
        inputPath: "C:\\audio.mp3",
        model: "small",
        language: "vi",
        outputFormat: "txt",
        cpuThreads: 12
      })
    ).toMatchObject({ model: "small", language: "vi", cpuThreads: 12 });
    expect(() =>
      startTranscriptionJobSchema.parse({ inputPath: "C:\\audio.mp3", cpuThreads: 0 })
    ).toThrow();
    expect(jobIdSchema.parse("7b60f0c8-a244-4cc3-8748-46a5ea79f341")).toBeTruthy();
    expect(() => jobIdSchema.parse("../../job")).toThrow();
  });

  it("validates live transcript session and chunk inputs", () => {
    expect(
      startLiveTranscriptSessionSchema.parse({
        model: "small",
        language: "auto",
        cpuThreads: 4,
        debugMode: false
      })
    ).toMatchObject({ model: "small", language: "auto", cpuThreads: 4 });
    expect(() =>
      startLiveTranscriptSessionSchema.parse({ model: "cloud-large" })
    ).toThrow();

    expect(
      liveTranscriptChunkSchema.parse({
        sessionId: "7b60f0c8-a244-4cc3-8748-46a5ea79f341",
        chunkIndex: 0,
        data: new Uint8Array([1, 2, 3]),
        mimeType: "audio/webm;codecs=opus",
        durationMs: 8000
      })
    ).toMatchObject({ chunkIndex: 0, durationMs: 8000 });
    expect(() =>
      liveTranscriptChunkSchema.parse({
        sessionId: "not-a-session",
        chunkIndex: -1,
        data: new Uint8Array([1]),
        mimeType: "audio/webm",
        durationMs: 8000
      })
    ).toThrow();

    expect(
      finishLiveTranscriptSessionSchema.parse({
        sessionId: "7b60f0c8-a244-4cc3-8748-46a5ea79f341",
        finalText: "hello",
        saveTranscript: true
      })
    ).toMatchObject({ finalText: "hello", saveTranscript: true });
  });

  it("scopes native window controls to the sending BrowserWindow", () => {
    registerIpcHandlers();
    const event = { sender: {} };

    electronMocks.handlers.get("window:minimize")!(event);
    expect(electronMocks.targetWindow.minimize).toHaveBeenCalledOnce();

    expect(electronMocks.handlers.get("window:toggle-maximize")!(event)).toBe(true);
    expect(electronMocks.targetWindow.maximize).toHaveBeenCalledOnce();
    expect(electronMocks.handlers.get("window:toggle-maximize")!(event)).toBe(false);
    expect(electronMocks.targetWindow.unmaximize).toHaveBeenCalledOnce();

    electronMocks.handlers.get("window:close")!(event);
    expect(electronMocks.targetWindow.close).toHaveBeenCalledOnce();
  });
});
