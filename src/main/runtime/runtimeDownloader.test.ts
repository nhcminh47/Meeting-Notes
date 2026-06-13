import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadWithChecksum } from "./runtimeDownloader";

const tempDirectories: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "whisper-download-test-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("downloadWithChecksum", () => {
  it("streams, verifies, and promotes a valid download", async () => {
    const content = Buffer.from("verified runtime");
    const checksum = createHash("sha256").update(content).digest("hex");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(content, { headers: { "content-length": `${content.length}` } }))
    );
    const outputPath = path.join(await tempDir(), "runtime.bin");
    const progress = vi.fn();

    await downloadWithChecksum({
      url: "https://example.test/runtime.bin",
      outputPath,
      expectedSha256: checksum,
      onProgress: progress
    });

    expect(await readFile(outputPath, "utf8")).toBe("verified runtime");
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it("deletes the temporary file after a checksum mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("corrupt")));
    const outputPath = path.join(await tempDir(), "runtime.bin");

    await expect(
      downloadWithChecksum({
        url: "https://example.test/runtime.bin",
        outputPath,
        expectedSha256: "0".repeat(64)
      })
    ).rejects.toThrow("Checksum mismatch");
    await expect(readFile(`${outputPath}.tmp`)).rejects.toThrow();
    await expect(readFile(outputPath)).rejects.toThrow();
  });

  it("rejects non-HTTPS URLs before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadWithChecksum({
        url: "http://example.test/runtime.bin",
        outputPath: path.join(await tempDir(), "runtime.bin"),
        expectedSha256: "0".repeat(64)
      })
    ).rejects.toThrow("HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
