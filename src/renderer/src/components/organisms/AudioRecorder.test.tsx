// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalStudioApi } from "../../../../shared/apiTypes";
import { AudioRecorder } from "./AudioRecorder";

class FakeMediaRecorder {
  static isTypeSupported(type: string) {
    return type === "audio/webm;codecs=opus";
  }

  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["recorded audio"], { type: this.mimeType })
    } as BlobEvent);
    this.onstop?.();
  }
}

function createApi(): LocalStudioApi {
  return {
    windowControls: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      isMaximized: vi.fn(),
      close: vi.fn(),
      onMaximizedChange: vi.fn()
    } as LocalStudioApi["windowControls"],
    runtime: {} as LocalStudioApi["runtime"],
    audio: {
      pickFile: vi.fn(),
      convertToWav16k: vi.fn(),
      saveRecording: vi.fn(async () => ({
        path: "C:\\studio\\work\\recordings\\recording.webm",
        name: "recording.webm"
      })),
      keepRecording: vi.fn(async () => undefined),
      discardRecording: vi.fn(async () => undefined),
      reportRecordingEvent: vi.fn(async () => undefined)
    },
    transcribe: {} as LocalStudioApi["transcribe"],
    liveTranscript: {} as LocalStudioApi["liveTranscript"],
    diagnostics: {} as LocalStudioApi["diagnostics"],
    remoteSettings: {} as LocalStudioApi["remoteSettings"],
    liveMeeting: {} as LocalStudioApi["liveMeeting"],
    speakers: {} as LocalStudioApi["speakers"],
    meetingNotes: {} as LocalStudioApi["meetingNotes"]
  };
}

beforeEach(() => {
  window.localStudio = createApi();
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn(async () => ({ state: "granted" })) }
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }))
    }
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal(
    "AudioContext",
    class {
      createAnalyser() {
        return {
          fftSize: 0,
          frequencyBinCount: 8,
          getByteFrequencyData: (samples: Uint8Array) => samples.fill(24)
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      close() {
        return Promise.resolve();
      }
    }
  );
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  if (!Blob.prototype.arrayBuffer) {
    Object.defineProperty(Blob.prototype, "arrayBuffer", {
      configurable: true,
      value: async () => new Uint8Array([1, 2, 3]).buffer
    });
  }
});

function renderRecorder(onTranscribe = vi.fn(async () => undefined)) {
  render(
    <AudioRecorder
      disabled={false}
      onStateChange={vi.fn()}
      onTranscribe={onTranscribe}
      onLogsChanged={vi.fn()}
    />
  );
  return { onTranscribe };
}

async function recordAndStop() {
  fireEvent.click(screen.getByRole("button", { name: "Record audio" }));
  expect(await screen.findByText("Recording locally")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(
    await screen.findByRole("dialog", { name: "Transcribe this recording?" })
  ).toBeVisible();
}

describe("AudioRecorder", () => {
  it("reports microphone permission denial", async () => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn(async () => ({ state: "denied" })) }
    });
    renderRecorder();

    fireEvent.click(screen.getByRole("button", { name: "Record audio" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Microphone access was denied"
    );
    expect(window.localStudio.audio.reportRecordingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "permission-denied" })
    );
  });

  it("saves and sends a recording through the existing transcription callback", async () => {
    const { onTranscribe } = renderRecorder();
    await recordAndStop();

    fireEvent.click(screen.getByRole("button", { name: "Transcribe now" }));

    await waitFor(() =>
      expect(onTranscribe).toHaveBeenCalledWith({
        path: "C:\\studio\\work\\recordings\\recording.webm",
        name: "recording.webm"
      })
    );
    expect(window.localStudio.audio.saveRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(Uint8Array),
        mimeType: "audio/webm;codecs=opus"
      })
    );
  });

  it("can retain a recording without transcription", async () => {
    renderRecorder();
    await recordAndStop();

    fireEvent.click(screen.getByRole("button", { name: "Save only" }));

    await waitFor(() =>
      expect(window.localStudio.audio.keepRecording).toHaveBeenCalledWith(
        "C:\\studio\\work\\recordings\\recording.webm"
      )
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can discard the temporary recording", async () => {
    renderRecorder();
    await recordAndStop();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() =>
      expect(window.localStudio.audio.discardRecording).toHaveBeenCalledWith(
        "C:\\studio\\work\\recordings\\recording.webm"
      )
    );
    expect(screen.getByRole("status")).toHaveTextContent("Recording discarded.");
  });
});
