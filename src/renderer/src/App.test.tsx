// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { RuntimeStatus } from "../../main/runtime/runtimeTypes";
import type { TranscriptionJobStatus } from "../../shared/apiTypes";

function statusWith(value: "missing" | "ready"): RuntimeStatus {
  return {
    runtimeVersion: "2026.06.11",
    items: Object.fromEntries(
      [
        ["ffmpeg", "ffmpeg"],
        ["whisper", "whisper"],
        ["modelSmall", "model-small"],
        ["modelMedium", "model-medium"]
      ].map(([key, id]) => [key, { id, status: value }])
    )
  };
}

function jobWith(
  state: TranscriptionJobStatus["state"],
  overrides: Partial<TranscriptionJobStatus> = {}
): TranscriptionJobStatus {
  return {
    jobId: "job-1",
    state,
    progress: state === "completed" ? 100 : 35,
    phase: state === "completed" ? "Transcription complete" : "Transcribing locally",
    canPause: state === "transcribing",
    canResume: state === "paused",
    canStop: ["queued", "converting", "transcribing", "paused"].includes(state),
    ...overrides
  };
}

beforeEach(() => {
  window.localStudio = {
    windowControls: {
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => true),
      isMaximized: vi.fn(async () => false),
      close: vi.fn(async () => undefined),
      onMaximizedChange: vi.fn(() => () => undefined)
    },
    runtime: {
      getStatus: vi.fn(async () => statusWith("missing")),
      ensureRequired: vi.fn(),
      installItem: vi.fn(),
      repair: vi.fn()
    },
    audio: {
      pickFile: vi.fn(),
      convertToWav16k: vi.fn(),
      saveRecording: vi.fn(),
      keepRecording: vi.fn(),
      discardRecording: vi.fn(),
      reportRecordingEvent: vi.fn(async () => undefined)
    },
    transcribe: {
      start: vi.fn(),
      getStatus: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn()
    },
    liveTranscript: {
      startSession: vi.fn(),
      enqueueChunk: vi.fn(),
      finishSession: vi.fn(),
      cancelSession: vi.fn()
    },
    diagnostics: {
      getEvents: vi.fn(async () => ({
        events: [],
        logFilePath: "C:\\logs\\events.jsonl"
      }))
    },
    remoteSettings: {
      get: vi.fn(async () => ({ serverUrl: null, hasApiKey: false })),
      save: vi.fn(),
      clearApiKey: vi.fn(),
      clearAll: vi.fn(),
      testConnection: vi.fn()
    },
    liveMeeting: {
      startRemoteEnglishMeeting: vi.fn(async () => ({ state: "recording" as const, meetingId: "mtg_test", message: "Streaming." })),
      sendAudioChunk: vi.fn(async () => undefined),
      stop: vi.fn(async () => ({ state: "stopped" as const, meetingId: "mtg_test", message: "Stopped." })),
      getStatus: vi.fn(async () => ({ state: "stopped" as const, meetingId: null, message: "Ready." })),
      onEvent: vi.fn(() => () => undefined)
    }
  };
});

describe("App", () => {
  it("exposes the active Studio destination as accessible navigation", async () => {
    render(<App />);

    await screen.findByText("Studio setup required");
    expect(screen.getByLabelText("Studio navigation")).toBeVisible();
    const studio = screen.getByRole("button", { name: "Studio" });
    expect(studio).toBeEnabled();
    expect(studio).toHaveAttribute("aria-current", "page");
  });

  it("routes custom titlebar controls through the preload bridge", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));

    expect(window.localStudio.windowControls.minimize).toHaveBeenCalledOnce();
    expect(window.localStudio.windowControls.toggleMaximize).toHaveBeenCalledOnce();
    expect(window.localStudio.windowControls.close).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Restore window" })).toBeVisible()
    );
  });

  it("shows missing runtime and blocks transcription", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText("missing")).toHaveLength(4));
    expect(screen.getByText("Studio setup required")).toBeVisible();
    expect(screen.getByText("Install the required runtime to enable transcription.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start transcription" })).toBeDisabled();
  });

  it("enables file selection once required runtime is ready", async () => {
    vi.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(2);
    window.localStudio.runtime.getStatus = vi.fn(async () => statusWith("ready"));
    render(<App />);
    await screen.findByText("Neko engine ready");
    const button = screen.getByRole("button", { name: "Browse files" });
    expect(button).toBeEnabled();
    expect(screen.getByText("Neko engine ready")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start transcription" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByLabelText("Transcription progress")).toHaveTextContent("0%");
    expect(screen.getByRole("button", { name: /CPU Threads/ })).toHaveTextContent(
      "Auto (2)"
    );
  });

  it("keeps the studio event log collapsed until requested", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: /Studio event log/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
    });
    expect(screen.getByRole("log")).toBeVisible();
  });

  it("shows processing state after starting a selected file", async () => {
    const processingJob = jobWith("transcribing");
    window.localStudio.runtime.getStatus = vi.fn(async () => statusWith("ready"));
    window.localStudio.audio.pickFile = vi.fn(async () => ({
      path: "C:\\audio\\meeting.wav",
      name: "meeting.wav"
    }));
    window.localStudio.transcribe.start = vi.fn(async () => processingJob);
    window.localStudio.transcribe.getStatus = vi.fn(async () => processingJob);

    render(<App />);
    await screen.findByText("Neko engine ready");
    const chooseButton = screen.getByRole("button", { name: "Browse files" });
    fireEvent.click(chooseButton);
    expect((await screen.findAllByText("meeting.wav"))[0]).toBeVisible();
    const startButton = screen.getByRole("button", { name: "Start transcription" });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    expect(await screen.findByText("transcribing")).toBeVisible();
    expect(screen.getByLabelText("Transcription progress")).toHaveTextContent("35%");
    expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
  });

  it("offers resume for a paused job", async () => {
    window.localStudio.runtime.getStatus = vi.fn(async () => statusWith("ready"));
    window.localStudio.audio.pickFile = vi.fn(async () => ({
      path: "C:\\audio\\meeting.wav",
      name: "meeting.wav"
    }));
    window.localStudio.transcribe.start = vi.fn(async () => jobWith("paused"));

    render(<App />);
    await screen.findByText("Neko engine ready");
    const chooseButton = screen.getByRole("button", { name: "Browse files" });
    fireEvent.click(chooseButton);
    expect((await screen.findAllByText("meeting.wav"))[0]).toBeVisible();
    const startButton = screen.getByRole("button", { name: "Start transcription" });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    expect(await screen.findByText("paused")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled();
  });

  it("renders completed output and generated file paths", async () => {
    window.localStudio.runtime.getStatus = vi.fn(async () => statusWith("ready"));
    window.localStudio.audio.pickFile = vi.fn(async () => ({
      path: "C:\\audio\\meeting.wav",
      name: "meeting.wav"
    }));
    window.localStudio.transcribe.start = vi.fn(async () =>
      jobWith("completed", {
        result: {
          text: "Local transcript",
          outputFiles: ["C:\\output\\meeting.txt"]
        }
      })
    );

    render(<App />);
    await screen.findByText("Neko engine ready");
    const chooseButton = screen.getByRole("button", { name: "Browse files" });
    fireEvent.click(chooseButton);
    expect((await screen.findAllByText("meeting.wav"))[0]).toBeVisible();
    const startButton = screen.getByRole("button", { name: "Start transcription" });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    expect(await screen.findByText("completed")).toBeVisible();
    const resultToggle = screen.getByRole("button", { name: /Transcript result/i });
    expect(resultToggle).toHaveAttribute("aria-expanded", "false");
    expect(resultToggle).toHaveTextContent("meeting.txt");
    const resultPanel = resultToggle.closest<HTMLElement>(".transcript-result");
    const workspace = document.querySelector<HTMLElement>(".transcription-workspace");
    const diagnostics = document.querySelector(".diagnostics-panel");
    expect(resultPanel).not.toBeNull();
    expect(workspace).not.toContainElement(resultPanel);
    expect(
      Boolean(
        resultPanel &&
          diagnostics &&
          (resultPanel.compareDocumentPosition(diagnostics) &
            Node.DOCUMENT_POSITION_FOLLOWING)
      )
    ).toBe(true);
    expect(screen.queryByText("Local transcript")).not.toBeInTheDocument();
    fireEvent.click(resultToggle);
    expect(screen.getByText("Local transcript")).toBeVisible();
    expect(screen.getByText("C:\\output\\meeting.txt")).toBeVisible();
  });

  it("announces runtime errors", async () => {
    window.localStudio.runtime.getStatus = vi.fn(async () => {
      throw new Error("Runtime status unavailable");
    });
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Runtime status unavailable"
    );
  });
});
