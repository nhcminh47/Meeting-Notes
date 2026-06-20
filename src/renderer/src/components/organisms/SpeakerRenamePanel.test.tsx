// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalStudioApi } from "../../../../shared/apiTypes";
import { SpeakerRenamePanel } from "./SpeakerRenamePanel";

const meetingId = "mtg_20260621_test";
const initial = {
  schemaVersion: 1 as const,
  meetingId,
  speakers: [{ id: "SPEAKER_01", label: "Speaker 1", name: null, source: "final" as const }]
};

beforeEach(() => {
  window.localStudio = {
    speakers: {
      getSpeakers: vi.fn(async () => initial),
      renameSpeaker: vi.fn(async (input) => ({
        ...initial,
        speakers: [{ ...initial.speakers[0], name: input.name.trim() || null }]
      })),
      clearSpeakerName: vi.fn(async () => initial)
    }
  } as unknown as LocalStudioApi;
});

describe("SpeakerRenamePanel", () => {
  it("shows stable metadata and saves and clears a display name", async () => {
    const onSpeakersChange = vi.fn();
    render(<SpeakerRenamePanel meetingId={meetingId} onSpeakersChange={onSpeakersChange} />);

    expect(await screen.findByText("SPEAKER_01")).toBeVisible();
    expect(screen.getByText("Label: Speaker 1")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Display name for SPEAKER_01"), { target: { value: "Minh" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(window.localStudio.speakers.renameSpeaker).toHaveBeenCalledWith({
      meetingId,
      speakerId: "SPEAKER_01",
      name: "Minh"
    }));
    expect(screen.getByDisplayValue("Minh")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(window.localStudio.speakers.clearSpeakerName).toHaveBeenCalledWith({
      meetingId,
      speakerId: "SPEAKER_01"
    }));
    expect(screen.getByDisplayValue("")).toBeVisible();
  });
});
