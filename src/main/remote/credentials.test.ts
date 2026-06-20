import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "C:\\test-user-data" },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}));

import { normalizeApiKey, normalizeServerUrl, redactApiKey } from "./credentials";

describe("remote credential validation", () => {
  it("accepts HTTP(S) and normalizes trailing slashes", () => {
    expect(normalizeServerUrl(" https://asr.example.test/ ")).toBe("https://asr.example.test");
    expect(normalizeServerUrl("http://localhost:8000///")).toBe("http://localhost:8000");
  });

  it.each(["javascript:alert(1)", "file:///secret", "data:text/plain,nope"])(
    "rejects unsafe URL %s",
    (value) => expect(() => normalizeServerUrl(value)).toThrow(/http/)
  );

  it("rejects empty API keys", () => {
    expect(() => normalizeApiKey("   ")).toThrow("Enter an API key.");
  });

  it("never includes the raw API key in redaction", () => {
    expect(redactApiKey("super-secret-value")).toBe("********");
    expect(redactApiKey(null)).toBe("");
  });
});
