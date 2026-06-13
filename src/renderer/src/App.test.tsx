// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    runtime: {
      getStatus: vi.fn(async () => statusWith("missing")),
      ensureRequired: vi.fn(),
      installItem: vi.fn(),
      repair: vi.fn()
    },
    audio: {
      pickFile: vi.fn(),
      convertToWav16k: vi.fn()
    },
    transcribe: {
      start: vi.fn(),
      getStatus: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn()
    },
    diagnostics: {
      getEvents: vi.fn(async () => ({
        events: [],
        logFilePath: "C:\\logs\\events.jsonl"
      }))
    }
  };
});

describe("App", () => {
  it("shows missing runtime and blocks transcription", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText("missing")).toHaveLength(4));
    expect(screen.getByText("Setup required")).toBeVisible();
    expect(screen.getByText("Install the required runtime to enable transcription.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("enables file selection once required runtime is ready", async () => {
    window.localStudio.runtime.getStatus = vi.fn(async () => statusWith("ready"));
    render(<App />);
    await screen.findByText("Runtime ready");
    const button = screen.getByRole("button", { name: "Choose audio file" });
    expect(button).toBeEnabled();
    expect(screen.getByText("Runtime ready")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByLabelText("Transcription progress")).toHaveTextContent("0%");
    expect(screen.getByRole("combobox", { name: "CPU usage" })).toHaveValue(
      String(navigator.hardwareConcurrency || 4)
    );
  });

  it("keeps the event log collapsed until requested", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: /Event log/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(await screen.findByRole("log")).toBeVisible();
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
    await screen.findByText("Runtime ready");
    const chooseButton = screen.getByRole("button", { name: "Choose audio file" });
    fireEvent.click(chooseButton);
    expect(await screen.findByText("meeting.wav")).toBeVisible();
    const startButton = screen.getByRole("button", { name: "Start" });
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
    await screen.findByText("Runtime ready");
    const chooseButton = screen.getByRole("button", { name: "Choose audio file" });
    fireEvent.click(chooseButton);
    expect(await screen.findByText("meeting.wav")).toBeVisible();
    const startButton = screen.getByRole("button", { name: "Start" });
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
    await screen.findByText("Runtime ready");
    const chooseButton = screen.getByRole("button", { name: "Choose audio file" });
    fireEvent.click(chooseButton);
    expect(await screen.findByText("meeting.wav")).toBeVisible();
    const startButton = screen.getByRole("button", { name: "Start" });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    expect(await screen.findByText("completed")).toBeVisible();
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
