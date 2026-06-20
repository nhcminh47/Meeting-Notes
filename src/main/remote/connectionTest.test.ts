import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "C:\\test-user-data" },
  safeStorage: { isEncryptionAvailable: () => false }
}));

import { testRemoteConnection } from "./connectionTest";

describe("remote connection test", () => {
  it.each([
    [200, "connected", true],
    [401, "unauthorized", false]
  ])("maps HTTP %i to %s", async (httpStatus, status, ok) => {
    const request = vi.fn(async () => new Response(null, { status: httpStatus }));
    const result = await testRemoteConnection("https://asr.example.test/", " secret ", { fetch: request });
    expect(result).toMatchObject({ ok, status });
    expect(request).toHaveBeenCalledWith("https://asr.example.test/health/private", expect.objectContaining({
      headers: { Authorization: "Bearer secret" }
    }));
  });

  it("maps network failures to a safe unreachable response", async () => {
    const result = await testRemoteConnection("https://asr.example.test", "secret", {
      fetch: vi.fn(async () => { throw new Error("socket included sensitive internals"); })
    });
    expect(result).toEqual({ ok: false, status: "unreachable", message: "Remote server is unreachable." });
  });

  it("rejects invalid URLs without making a request", async () => {
    const request = vi.fn();
    const result = await testRemoteConnection("file:///secret", "secret", { fetch: request });
    expect(result.status).toBe("invalid_url");
    expect(request).not.toHaveBeenCalled();
  });
});
