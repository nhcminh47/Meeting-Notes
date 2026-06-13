// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./atoms/Button";
import { CatMascot } from "./atoms/CatMascot";
import { ProgressBar } from "./atoms/ProgressBar";
import { JobStatus } from "./molecules/JobStatus";

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
});

describe("JobStatus", () => {
  it.each([
    ["paused", "paused"],
    ["completed", "completed"],
    ["error", "error"]
  ] as const)("renders the %s semantic state", (state, label) => {
    render(
      <JobStatus
        running={false}
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
