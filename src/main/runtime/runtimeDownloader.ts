import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { calculateSha256, normalizeSha256 } from "./checksum";
import { logError, logEvent } from "../eventLogger";

export async function downloadWithChecksum(input: {
  url: string;
  outputPath: string;
  expectedSha256: string;
  onProgress?: (progress: number) => void;
}): Promise<void> {
  const sourceUrl = new URL(input.url);
  if (sourceUrl.protocol !== "https:") {
    throw new Error("Runtime downloads must use HTTPS.");
  }

  const expectedSha256 = normalizeSha256(input.expectedSha256);
  const tempPath = `${input.outputPath}.tmp`;
  logEvent("info", "download", "Runtime download started.", {
    host: sourceUrl.host,
    file: path.basename(input.outputPath)
  });
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  await rm(tempPath, { force: true });

  try {
    const response = await fetch(sourceUrl, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed with HTTP ${response.status}.`);
    }
    const finalUrl = response.url || sourceUrl.href;
    if (new URL(finalUrl).protocol !== "https:") {
      throw new Error("Download redirected to a non-HTTPS destination.");
    }

    const total = Number(response.headers.get("content-length")) || undefined;
    let downloaded = 0;
    const source = Readable.fromWeb(response.body as never);
    source.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      if (total) {
        input.onProgress?.(Math.min(100, Math.round((downloaded / total) * 100)));
      }
    });

    await pipeline(source, createWriteStream(tempPath, { flags: "wx" }));
    const actualSha256 = await calculateSha256(tempPath);
    if (actualSha256 !== expectedSha256) {
      logEvent("error", "download", "Runtime checksum verification failed.", {
        file: path.basename(input.outputPath),
        expectedSha256,
        actualSha256
      });
      throw new Error(
        `Checksum mismatch. Expected ${expectedSha256}, received ${actualSha256}.`
      );
    }

    await rm(input.outputPath, { force: true });
    await rename(tempPath, input.outputPath);
    input.onProgress?.(100);
    logEvent("info", "download", "Runtime download verified and saved.", {
      file: path.basename(input.outputPath),
      sha256: actualSha256
    });
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    logError("download", "Runtime download failed.", error, {
      host: sourceUrl.host,
      file: path.basename(input.outputPath)
    });
    throw error;
  }
}
