// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalStudioApi } from "../../../../shared/apiTypes";
import { ExportPanel } from "./ExportPanel";

const meetingId = "mtg_export_ui";

beforeEach(() => {
  window.localStudio = {
    exports: {
      exportMeeting: vi.fn(async () => ({
        ok: true as const,
        files: [{ format: "txt" as const, path: "exports/transcript.txt" }]
      }))
    }
  } as unknown as LocalStudioApi;
});

describe("ExportPanel", () => {
  it("exports selected local artifacts and shows returned paths", async () => {
    render(<ExportPanel meetingId={meetingId} />);
    fireEvent.click(screen.getByRole("button", { name: "Export selected" }));
    await waitFor(() => expect(window.localStudio.exports.exportMeeting).toHaveBeenCalledWith({
      meetingId,
      formats: ["txt", "json", "srt", "vtt", "md"]
    }));
    expect(await screen.findByLabelText("Exported files")).toHaveTextContent("exports/transcript.txt");
  });

  it("shows safe export errors", async () => {
    window.localStudio.exports.exportMeeting = vi.fn(async () => { throw new Error("Final transcript is required for transcript export."); });
    render(<ExportPanel meetingId={meetingId} />);
    fireEvent.click(screen.getByRole("button", { name: "Export selected" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Final transcript is required"));
  });
});
