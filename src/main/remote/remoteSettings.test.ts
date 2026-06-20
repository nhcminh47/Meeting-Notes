import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "C:\\test-user-data" },
  safeStorage: { isEncryptionAvailable: () => false }
}));
import type { RemoteCredentialStore } from "./credentials";
import { RemoteSettingsService } from "./remoteSettings";

class MemoryStore implements RemoteCredentialStore {
  serverUrl: string | null = null;
  apiKey: string | null = null;
  async getServerUrl() { return this.serverUrl; }
  async setServerUrl(value: string) { this.serverUrl = value; }
  async getApiKey() { return this.apiKey; }
  async setApiKey(value: string) { this.apiKey = value; }
  async clearApiKey() { this.apiKey = null; }
  async clearAll() { this.serverUrl = null; this.apiKey = null; }
}

describe("RemoteSettingsService", () => {
  it("returns only URL and key presence after saving", async () => {
    const store = new MemoryStore();
    const service = new RemoteSettingsService(store);
    const result = await service.save({ serverUrl: "https://asr.example.test/", apiKey: "raw-secret" });
    expect(result).toEqual({ serverUrl: "https://asr.example.test", hasApiKey: true });
    expect(JSON.stringify(result)).not.toContain("raw-secret");
  });

  it("clears the API key without clearing the URL", async () => {
    const store = new MemoryStore();
    const service = new RemoteSettingsService(store);
    await service.save({ serverUrl: "https://asr.example.test", apiKey: "secret" });
    expect(await service.clearApiKey()).toEqual({ serverUrl: "https://asr.example.test", hasApiKey: false });
  });
});
