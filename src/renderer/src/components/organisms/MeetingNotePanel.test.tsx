// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalStudioApi } from "../../../../shared/apiTypes";
import { MeetingNotePanel } from "./MeetingNotePanel";

const meetingId = "mtg_note_ui";

beforeEach(() => {
  window.localStudio = {
    meetingNotes: {
      get: vi.fn(async () => null),
      generate: vi.fn(async () => ({ meetingId, status: "completed" as const, source: "final-transcript.json" as const, markdown: "# Meeting Note\n\n## Summary\n\nDone." })),
      regenerate: vi.fn()
    }
  } as unknown as LocalStudioApi;
});

describe("MeetingNotePanel", () => {
  it("generates and previews a local meeting note", async () => {
    render(<MeetingNotePanel meetingId={meetingId} />);
    const button = await screen.findByRole("button", { name: "Generate Meeting Note" });
    fireEvent.click(button);
    expect(await screen.findByLabelText("Generated meeting note")).toHaveTextContent("Summary");
    expect(window.localStudio.meetingNotes.generate).toHaveBeenCalledWith({ meetingId });
    expect(screen.getByRole("button", { name: "Regenerate Meeting Note" })).toBeEnabled();
  });

  it("shows safe generation errors", async () => {
    window.localStudio.meetingNotes.generate = vi.fn(async () => { throw new Error("Final transcript is required to generate a meeting note."); });
    render(<MeetingNotePanel meetingId={meetingId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate Meeting Note" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Final transcript is required"));
  });
});
