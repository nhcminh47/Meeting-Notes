// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalStudioApi } from "../../../../shared/apiTypes";
import { RemoteServerSettings } from "./RemoteServerSettings";

const remoteSettings: LocalStudioApi["remoteSettings"] = {
  get: vi.fn(async () => ({ serverUrl: "https://asr.example.test", hasApiKey: true })),
  save: vi.fn(async () => ({ serverUrl: "https://asr.example.test", hasApiKey: true })),
  clearApiKey: vi.fn(async () => ({ serverUrl: "https://asr.example.test", hasApiKey: false })),
  clearAll: vi.fn(async () => ({ serverUrl: null, hasApiKey: false })),
  testConnection: vi.fn(async () => ({ ok: true as const, status: "connected" as const, message: "Connected to remote server." }))
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStudio = { remoteSettings } as LocalStudioApi;
});

describe("RemoteServerSettings", () => {
  it("shows only a masked saved-key state", async () => {
    render(<RemoteServerSettings />);
    expect(await screen.findByDisplayValue("https://asr.example.test")).toBeVisible();
    const keyInput = screen.getByLabelText("API Key");
    expect(keyInput).toHaveAttribute("type", "password");
    expect(keyInput).toHaveAttribute("placeholder", "********");
    expect(keyInput).toHaveValue("");
  });

  it("clears entered key material after save", async () => {
    render(<RemoteServerSettings />);
    const keyInput = await screen.findByLabelText("API Key");
    fireEvent.change(keyInput, { target: { value: "synthetic-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(remoteSettings.save).toHaveBeenCalledWith({
      serverUrl: "https://asr.example.test",
      apiKey: "synthetic-key"
    }));
    expect(keyInput).toHaveValue("");
    expect(screen.queryByDisplayValue("synthetic-key")).not.toBeInTheDocument();
  });
});
