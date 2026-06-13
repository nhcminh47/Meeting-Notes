// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { RuntimeStatus } from "../../main/runtime/runtimeTypes";

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
    expect(screen.getByText("Install the required runtime to enable transcription.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("enables file selection once required runtime is ready", async () => {
    window.localStudio.runtime.getStatus = vi.fn(async () => statusWith("ready"));
    render(<App />);
    const button = await screen.findByRole("button", { name: "Choose audio file" });
    expect(button).toBeEnabled();
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
});
