import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userData = vi.hoisted(() => ({ path: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => userData.path
  }
}));

vi.mock("./runtimeDownloader", () => ({
  downloadWithChecksum: vi.fn(
    async (input: { outputPath: string; onProgress?: (progress: number) => void }) => {
      await mkdir(path.dirname(input.outputPath), { recursive: true });
      await writeFile(input.outputPath, "download");
      input.onProgress?.(100);
    }
  )
}));

vi.mock("./archive", () => ({
  extractZipSafely: vi.fn(
    async (input: { destinationPath: string; expectedFiles: string[] }) => {
      await mkdir(input.destinationPath, { recursive: true });
      await Promise.all(
        input.expectedFiles.map((file) => writeFile(path.join(input.destinationPath, file), "binary"))
      );
    }
  )
}));

import {
  ensureRequiredRuntime,
  getRuntimeStatus,
  installRuntimeItem,
  repairRuntime
} from "./runtimeManager";

beforeEach(async () => {
  userData.path = await mkdtemp(path.join(os.tmpdir(), "whisper-manager-test-"));
});

afterEach(async () => {
  await rm(userData.path, { recursive: true, force: true });
});

describe("runtime manager", () => {
  it("installs required items while skipping the optional model", async () => {
    const status = await ensureRequiredRuntime();
    expect(status.items.ffmpeg.status).toBe("ready");
    expect(status.items.whisper.status).toBe("ready");
    expect(status.items.modelSmall.status).toBe("ready");
    expect(status.items.modelMedium.status).toBe("missing");
  });

  it("installs the optional model only when requested", async () => {
    await installRuntimeItem("model-medium");
    const status = await getRuntimeStatus();
    expect(status.items.modelMedium.status).toBe("ready");
    expect(status.items.modelSmall.status).toBe("missing");
  });

  it("rejects unknown item IDs", async () => {
    await expect(installRuntimeItem("not-real")).rejects.toThrow("Unknown runtime item");
  });

  it("repair removes unrelated runtime content and reinstalls required items", async () => {
    const obsolete = path.join(userData.path, "runtime", "obsolete.bin");
    await mkdir(path.dirname(obsolete), { recursive: true });
    await writeFile(obsolete, "old");

    const status = await repairRuntime();
    expect(status.items.modelSmall.status).toBe("ready");
    await expect(import("node:fs/promises").then(({ stat }) => stat(obsolete))).rejects.toThrow();
  });
});
