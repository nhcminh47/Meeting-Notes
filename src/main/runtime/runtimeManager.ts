import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_RUNTIME_MANIFEST } from "./defaultRuntimeManifest";
import { extractZipSafely } from "./archive";
import { calculateSha256, normalizeSha256 } from "./checksum";
import { downloadWithChecksum } from "./runtimeDownloader";
import { getRuntimePaths, resolveUserDataPath } from "./runtimePaths";
import { logError, logEvent } from "../eventLogger";
import type {
  LocalRuntimeManifest,
  RuntimeManifestItem,
  RuntimeStatus,
  RuntimeStatusItem
} from "./runtimeTypes";

const transientStatus = new Map<string, RuntimeStatusItem>();
let operationQueue: Promise<void> = Promise.resolve();

function assertSupportedPlatform(): void {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Local Whisper Studio currently supports Windows x64 only.");
  }
}

function getManifestEntry(itemId: string): [string, RuntimeManifestItem] {
  const entry = Object.entries(DEFAULT_RUNTIME_MANIFEST.items).find(
    ([, item]) => item.id === itemId
  );
  if (!entry) {
    throw new Error(`Unknown runtime item: ${itemId}`);
  }
  return entry;
}

function getItemLocalPath(item: RuntimeManifestItem): string {
  if (item.outputPath) {
    return resolveUserDataPath(item.outputPath);
  }
  if (item.extractTo && item.expectedFiles?.length) {
    return path.join(resolveUserDataPath(item.extractTo), item.expectedFiles[0]);
  }
  throw new Error(`Runtime item ${item.id} has an invalid destination.`);
}

async function pathIsFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function hasExpectedChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
  if (!(await pathIsFile(filePath))) return false;
  try {
    return (await calculateSha256(filePath)) === normalizeSha256(expectedSha256);
  } catch {
    return false;
  }
}

async function isItemReady(item: RuntimeManifestItem): Promise<boolean> {
  if (item.outputPath) {
    return pathIsFile(resolveUserDataPath(item.outputPath));
  }
  if (item.extractTo && item.expectedFiles?.length) {
    const root = resolveUserDataPath(item.extractTo);
    const results = await Promise.all(
      item.expectedFiles.map((file) => pathIsFile(path.join(root, file)))
    );
    return results.every(Boolean);
  }
  return false;
}

async function readLocalManifest(): Promise<LocalRuntimeManifest> {
  const { manifestPath } = getRuntimePaths();
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as LocalRuntimeManifest;
  } catch {
    return {
      runtimeVersion: DEFAULT_RUNTIME_MANIFEST.runtimeVersion,
      installedAt: new Date().toISOString(),
      items: {}
    };
  }
}

async function recordInstalledItem(item: RuntimeManifestItem): Promise<void> {
  const { manifestPath, runtimeRoot } = getRuntimePaths();
  const manifest = await readLocalManifest();
  const now = new Date().toISOString();
  manifest.runtimeVersion = DEFAULT_RUNTIME_MANIFEST.runtimeVersion;
  manifest.installedAt = now;
  manifest.items[item.id] = {
    id: item.id,
    sha256: item.sha256,
    localPath: getItemLocalPath(item),
    installedAt: now
  };
  await mkdir(runtimeRoot, { recursive: true });
  const tempPath = `${manifestPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rm(manifestPath, { force: true });
  await rename(tempPath, manifestPath);
}

function setTransient(itemKey: string, status: RuntimeStatusItem): void {
  transientStatus.set(itemKey, status);
}

async function installItem(itemKey: string, item: RuntimeManifestItem): Promise<void> {
  const localPath = getItemLocalPath(item);
  const startedAt = Date.now();
  logEvent("info", "runtime", "Runtime item installation started.", {
    itemId: item.id,
    itemType: item.type,
    optional: item.optional ?? false
  });
  setTransient(itemKey, { id: item.id, status: "downloading", progress: 0, localPath });
  const { tempRoot } = getRuntimePaths();
  await mkdir(tempRoot, { recursive: true });

  try {
    if (item.type === "file" && item.outputPath) {
      await downloadWithChecksum({
        url: item.url,
        outputPath: resolveUserDataPath(item.outputPath),
        expectedSha256: item.sha256,
        onProgress: (progress) =>
          setTransient(itemKey, {
            id: item.id,
            status: "downloading",
            progress,
            localPath
          })
      });
    } else if (item.type === "zip" && item.extractTo && item.expectedFiles) {
      const archivePath = path.join(tempRoot, `${item.id}.zip`);
      if (await hasExpectedChecksum(archivePath, item.sha256)) {
        logEvent("info", "runtime", "Reusing verified cached runtime archive.", {
          itemId: item.id,
          archive: archivePath
        });
      } else {
        await downloadWithChecksum({
          url: item.url,
          outputPath: archivePath,
          expectedSha256: item.sha256,
          onProgress: (progress) =>
            setTransient(itemKey, {
              id: item.id,
              status: "downloading",
              progress,
              localPath
            })
        });
      }
      setTransient(itemKey, { id: item.id, status: "extracting", localPath });
      try {
        await extractZipSafely({
          archivePath,
          destinationPath: resolveUserDataPath(item.extractTo),
          expectedFiles: item.expectedFiles,
          tempRoot
        });
      } finally {
        await rm(archivePath, { force: true });
      }
    } else {
      throw new Error(`Runtime item ${item.id} is misconfigured.`);
    }

    await recordInstalledItem(item);
    setTransient(itemKey, { id: item.id, status: "ready", progress: 100, localPath });
    logEvent("info", "runtime", "Runtime item installation completed.", {
      itemId: item.id,
      durationMs: Date.now() - startedAt,
      localPath
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime installation failed.";
    setTransient(itemKey, { id: item.id, status: "error", localPath, error: message });
    logError("runtime", "Runtime item installation failed.", error, {
      itemId: item.id,
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}

function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  const items: RuntimeStatus["items"] = {};

  for (const [itemKey, item] of Object.entries(DEFAULT_RUNTIME_MANIFEST.items)) {
    const transient = transientStatus.get(itemKey);
    if (transient && ["downloading", "extracting", "error"].includes(transient.status)) {
      items[itemKey] = transient;
      continue;
    }
    const ready = await isItemReady(item);
    items[itemKey] = {
      id: item.id,
      status: ready ? "ready" : "missing",
      localPath: ready ? getItemLocalPath(item) : undefined,
      progress: ready ? 100 : undefined
    };
  }

  return { runtimeVersion: DEFAULT_RUNTIME_MANIFEST.runtimeVersion, items };
}

export async function ensureRequiredRuntime(): Promise<RuntimeStatus> {
  return runExclusive(async () => {
    assertSupportedPlatform();
    logEvent("info", "runtime", "Required runtime installation requested.");
    for (const [itemKey, item] of Object.entries(DEFAULT_RUNTIME_MANIFEST.items)) {
      if (!item.optional && !(await isItemReady(item))) {
        await installItem(itemKey, item);
      }
    }
    return getRuntimeStatus();
  });
}

export async function installRuntimeItem(itemId: string): Promise<RuntimeStatus> {
  return runExclusive(async () => {
    assertSupportedPlatform();
    logEvent("info", "runtime", "Single runtime item installation requested.", { itemId });
    const [itemKey, item] = getManifestEntry(itemId);
    if (!(await isItemReady(item))) {
      await installItem(itemKey, item);
    }
    return getRuntimeStatus();
  });
}

export async function repairRuntime(): Promise<RuntimeStatus> {
  return runExclusive(async () => {
    assertSupportedPlatform();
    const { runtimeRoot } = getRuntimePaths();
    logEvent("warn", "runtime", "Runtime repair requested.", { runtimeRoot });
    await rm(runtimeRoot, { recursive: true, force: true });
    transientStatus.clear();
    for (const [itemKey, item] of Object.entries(DEFAULT_RUNTIME_MANIFEST.items)) {
      if (!item.optional) {
        await installItem(itemKey, item);
      }
    }
    return getRuntimeStatus();
  });
}

export function getRuntimeExecutablePaths(): {
  ffmpegExe: string;
  ffprobeExe?: string;
  whisperExe: string;
  modelSmall: string;
  modelMedium: string;
} {
  return {
    ffmpegExe: path.join(resolveUserDataPath("runtime/bin/ffmpeg"), "ffmpeg.exe"),
    ffprobeExe: path.join(resolveUserDataPath("runtime/bin/ffmpeg"), "ffprobe.exe"),
    whisperExe: path.join(resolveUserDataPath("runtime/bin/whisper"), "whisper-cli.exe"),
    modelSmall: resolveUserDataPath("runtime/models/ggml-small.bin"),
    modelMedium: resolveUserDataPath("runtime/models/ggml-medium.bin")
  };
}
