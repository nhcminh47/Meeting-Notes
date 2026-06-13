import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  dialog: {},
  ipcMain: { handle: vi.fn() }
}));

import {
  convertAudioSchema,
  jobIdSchema,
  runtimeItemSchema,
  startTranscriptionJobSchema,
  transcribeAudioSchema
} from "./ipc";

describe("IPC schemas", () => {
  it("only accepts allowlisted runtime item IDs", () => {
    expect(runtimeItemSchema.parse("model-medium")).toBe("model-medium");
    expect(() => runtimeItemSchema.parse("../../payload")).toThrow();
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
});
