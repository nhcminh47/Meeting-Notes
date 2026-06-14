// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./atoms/Button";
import { CatMascot } from "./atoms/CatMascot";
import { ProgressBar } from "./atoms/ProgressBar";
import { SelectField } from "./atoms/SelectField";
import { JobStatus } from "./molecules/JobStatus";
import { DiagnosticsPanel } from "./organisms/DiagnosticsPanel";
import { TranscriptResultPanel } from "./organisms/TranscriptResultPanel";

function TestIcon(props: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" aria-hidden={props["aria-hidden"]}>
      <path d="M3 3h10v10H3z" />
    </svg>
  );
}

describe("atomic components", () => {
  it("keeps button behavior native and accessible", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run locally</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Run locally" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("exposes progress semantics", () => {
    render(<ProgressBar value={42} label="Download progress" />);
    expect(screen.getByRole("progressbar", { name: "Download progress" })).toHaveAttribute(
      "aria-valuenow",
      "42"
    );
  });

  it("renders the mascot as decorative artwork", () => {
    const { container } = render(<CatMascot state="processing" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("opens the custom select with a click and selects an option", () => {
    const onChange = vi.fn();
    render(
      <SelectField
        label="Model"
        value="small"
        Icon={TestIcon}
        options={[
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" }
        ]}
        onChange={onChange}
      />
    );

    const trigger = screen.getByRole("button", { name: "Model Small" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("option", { name: "Medium" }));
    expect(onChange).toHaveBeenCalledWith("medium");
  });

  it("supports arrow navigation, disabled-option skipping, and enter selection", () => {
    const onChange = vi.fn();
    render(
      <SelectField
        label="Model"
        value="small"
        options={[
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium", disabled: true },
          { value: "large", label: "Large" }
        ]}
        onChange={onChange}
      />
    );

    const trigger = screen.getByRole("button", { name: "Model Small" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("large");
  });

  it("closes the custom select with escape and returns focus to the trigger", () => {
    render(
      <SelectField
        label="Language"
        value="vi"
        options={[
          { value: "vi", label: "Vietnamese" },
          { value: "en", label: "English" }
        ]}
        onChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole("button", { name: "Language Vietnamese" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox", { name: "Language" })).toBeVisible();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Language" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the custom select on outside pointer interaction", () => {
    render(
      <div>
        <SelectField
          label="Output"
          value="txt"
          options={[
            { value: "txt", label: "Text" },
            { value: "json", label: "JSON" }
          ]}
          onChange={vi.fn()}
        />
        <button type="button">Outside</button>
      </div>
    );

    const trigger = screen.getByRole("button", { name: "Output Text" });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox", { name: "Output" })).toBeVisible();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox", { name: "Output" })).not.toBeInTheDocument();
  });

  it("does not open when the custom select trigger is disabled", () => {
    render(
      <SelectField
        label="CPU Threads"
        value={4}
        disabled
        options={[{ value: 4, label: "Auto (4)" }]}
        onChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole("button", { name: "CPU Threads Auto (4)" });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("JobStatus", () => {
  it("renders a muted individual-bar waveform for the idle state", () => {
    const { container } = render(
      <JobStatus running={false} hasSelection={false} job={null} />
    );

    const progress = screen.getByRole("progressbar", {
      name: "Transcription completion"
    });
    const bars = container.querySelectorAll(".job-status__waveform > span");

    expect(progress).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("idle")).toBeVisible();
    expect(screen.getByText("0%")).toBeVisible();
    expect(bars.length).toBeGreaterThan(20);
    expect(
      container.querySelectorAll(".job-status__waveform-bar--complete")
    ).toHaveLength(0);
    expect(new Set(Array.from(bars, (bar) => bar.getAttribute("style")).filter(Boolean)).size)
      .toBeGreaterThan(10);
  });

  it("marks waveform bars complete from real progress", () => {
    const { container } = render(
      <JobStatus
        running
        hasSelection
        job={{
          jobId: "job-1",
          state: "transcribing",
          progress: 40,
          phase: "Transcribing locally",
          canPause: true,
          canResume: false,
          canStop: true
        }}
      />
    );

    expect(
      screen.getByRole("progressbar", { name: "Transcription completion" })
    ).toHaveAttribute("aria-valuenow", "40");
    expect(
      container.querySelectorAll(".job-status__waveform-bar--complete").length
    ).toBeGreaterThan(0);
    expect(screen.getByText("transcribing")).toBeVisible();
  });

  it.each([
    ["paused", "paused"],
    ["completed", "completed"],
    ["error", "error"]
  ] as const)("renders the %s semantic state", (state, label) => {
    render(
      <JobStatus
        running={false}
        hasSelection
        job={{
          jobId: "job-1",
          state,
          progress: state === "completed" ? 100 : 40,
          phase: "Current phase",
          canPause: false,
          canResume: state === "paused",
          canStop: state === "paused"
        }}
      />
    );
    expect(screen.getByText(label)).toBeVisible();
  });
});

describe("DiagnosticsPanel", () => {
  it("keeps the console collapsed and pluralizes an empty event count", () => {
    render(
      <DiagnosticsPanel
        snapshot={{ events: [], logFilePath: "C:\\logs\\events.jsonl" }}
        expanded={false}
        onToggle={vi.fn()}
      />
    );

    const toggle = screen.getByRole("button", { name: /Studio event log/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("0 events");
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("renders real event metadata, details, and a singular count", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <DiagnosticsPanel
        snapshot={{
          logFilePath: "C:\\logs\\events.jsonl",
          events: [
            {
              id: 1,
              timestamp: "2026-06-14T12:21:20.000Z",
              level: "warn",
              source: "preview",
              message: "Frontend standalone preview ready.",
              details: { attempt: 2 }
            }
          ]
        }}
        expanded
        onToggle={onToggle}
      />
    );

    const toggle = screen.getByRole("button", { name: /Studio event log/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("1 event");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(screen.getByRole("log", { name: "Application event log" })).toBeVisible();
    expect(screen.getByText("warn")).toBeVisible();
    expect(screen.getByText("preview")).toBeVisible();
    expect(screen.getByText("Frontend standalone preview ready.")).toBeVisible();
    expect(screen.getByText("attempt")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(container.querySelector(".diagnostics-panel__console")).toBeInTheDocument();
    expect(container.querySelector(".diagnostics-panel__mascot")).not.toBeInTheDocument();
    expect(container.querySelector(".diagnostics-panel__console img")).not.toBeInTheDocument();
  });

  it("updates plural counts when a live snapshot adds an event", () => {
    const firstEvent = {
      id: 1,
      timestamp: "2026-06-14T12:21:20.000Z",
      level: "error" as const,
      source: "runtime",
      message: "Runtime check failed."
    };
    const { rerender } = render(
      <DiagnosticsPanel
        snapshot={{ logFilePath: "C:\\logs\\events.jsonl", events: [firstEvent] }}
        expanded
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Studio event log/i })).toHaveTextContent(
      "1 error"
    );

    rerender(
      <DiagnosticsPanel
        snapshot={{
          logFilePath: "C:\\logs\\events.jsonl",
          events: [
            firstEvent,
            {
              id: 2,
              timestamp: "2026-06-14T12:21:21.000Z",
              level: "info",
              source: "preview",
              message: "Preview ready."
            }
          ]
        }}
        expanded
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Studio event log/i })).toHaveTextContent(
      "2 events"
    );
    expect(screen.getAllByText(/Runtime check failed|Preview ready/)).toHaveLength(2);
  });
});

describe("TranscriptResultPanel", () => {
  it("starts collapsed with completion and output metadata", () => {
    render(
      <TranscriptResultPanel
        jobId="job-1"
        text="Local transcript"
        outputFiles={["C:\\output\\meeting.txt"]}
        format="txt"
        selectedFileName="meeting.wav"
      />
    );

    const toggle = screen.getByRole("button", { name: /Transcript result/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Finished locally");
    expect(toggle).toHaveTextContent("TXT");
    expect(toggle).toHaveTextContent("meeting.txt");
    expect(screen.queryByText("Local transcript")).not.toBeInTheDocument();
    expect(screen.queryByText("C:\\output\\meeting.txt")).not.toBeInTheDocument();
  });

  it("expands into a readable transcript and saved paths", () => {
    render(
      <TranscriptResultPanel
        jobId="job-1"
        text={"First line\nSecond line"}
        outputFiles={[
          "C:\\output\\meeting.txt",
          "C:\\output\\meeting.srt"
        ]}
        format="txt"
      />
    );

    const toggle = screen.getByRole("button", { name: /Transcript result/i });
    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/First line/)).toHaveTextContent("First line Second line");
    expect(screen.getByText("Saved to")).toBeVisible();
    expect(screen.getByText("C:\\output\\meeting.txt")).toBeVisible();
    expect(screen.getByText("C:\\output\\meeting.srt")).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("uses the selected filename for a text-only result", () => {
    render(
      <TranscriptResultPanel
        jobId="job-2"
        text="Text-only transcript"
        outputFiles={[]}
        format="json"
        selectedFileName="recording.wav"
      />
    );

    const toggle = screen.getByRole("button", { name: /Transcript result/i });
    expect(toggle).toHaveTextContent("recording.wav");
    fireEvent.click(toggle);
    expect(screen.getByText("Text-only transcript")).toBeVisible();
  });

  it("shows a fallback for a generated file without a text preview", () => {
    render(
      <TranscriptResultPanel
        jobId="job-3"
        text=""
        outputFiles={["C:\\output\\recording.json"]}
        format="json"
        selectedFileName="recording.wav"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Transcript result/i }));
    expect(
      screen.getByText("The transcript file was generated without a text preview.")
    ).toBeVisible();
  });

  it("renders nothing without transcript text or output files", () => {
    render(
      <TranscriptResultPanel
        jobId="job-empty"
        text=""
        outputFiles={[]}
        format="txt"
      />
    );

    expect(
      screen.queryByRole("button", { name: /Transcript result/i })
    ).not.toBeInTheDocument();
  });

  it("resets to collapsed when a new keyed job mounts", () => {
    const { rerender } = render(
      <TranscriptResultPanel
        key="job-1"
        jobId="job-1"
        text="First transcript"
        outputFiles={[]}
        format="txt"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Transcript result/i }));
    expect(screen.getByText("First transcript")).toBeVisible();

    rerender(
      <TranscriptResultPanel
        key="job-2"
        jobId="job-2"
        text="Second transcript"
        outputFiles={[]}
        format="srt"
      />
    );

    expect(screen.getByRole("button", { name: /Transcript result/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByText("Second transcript")).not.toBeInTheDocument();
  });

  it("searches transcript text, highlights matches, and clears the query", () => {
    const { container } = render(
      <TranscriptResultPanel
        jobId="job-search"
        text="Local notes stay local. LOCAL processing is private."
        outputFiles={[]}
        format="txt"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Transcript result/i }));
    const search = screen.getByRole("searchbox", { name: "Search transcript" });
    expect(screen.getByText("0 matches")).toBeVisible();

    fireEvent.change(search, { target: { value: "local" } });
    expect(screen.getByText("3 matches")).toBeVisible();
    expect(container.querySelectorAll(".transcript-result__preview mark")).toHaveLength(3);
    expect(container.querySelector(".transcript-result__preview")).toHaveTextContent(
      "Local notes stay local. LOCAL processing is private."
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear transcript search" }));
    expect(search).toHaveValue("");
    expect(screen.getByText("0 matches")).toBeVisible();
    expect(container.querySelectorAll(".transcript-result__preview mark")).toHaveLength(0);
  });

  it("copies the full unmodified transcript and reports success", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(
      <TranscriptResultPanel
        jobId="job-copy"
        text={"First line\nSecond line"}
        outputFiles={[]}
        format="txt"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Transcript result/i }));
    fireEvent.click(screen.getByRole("button", { name: "Copy all" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("First line\nSecond line")
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Transcript copied to clipboard."
    );
  });

  it("announces clipboard failures without changing transcript content", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("Denied"))) }
    });
    render(
      <TranscriptResultPanel
        jobId="job-copy-error"
        text="Keep this transcript unchanged."
        outputFiles={[]}
        format="txt"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Transcript result/i }));
    fireEvent.click(screen.getByRole("button", { name: "Copy all" }));

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Copy failed. Clipboard access is unavailable.");
    expect(screen.getByText("Keep this transcript unchanged.")).toBeVisible();
  });
});
