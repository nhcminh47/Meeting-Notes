import { createWriteStream } from "node:fs";
import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { logError, logEvent } from "../eventLogger";

export function validateArchiveEntryPath(entryName: string): void {
  const normalized = entryName.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`Unsafe archive entry: ${entryName}`);
  }
}

export async function findExpectedFileDirectories(
  root: string,
  expectedFiles: string[]
): Promise<string[]> {
  const candidates: string[] = [];
  const pending = [root];

  while (pending.length > 0) {
    const directory = pending.pop()!;
    const entries = await readdir(directory, { withFileTypes: true });
    const fileNames = new Set(
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name.toLowerCase())
    );
    if (expectedFiles.every((file) => fileNames.has(file.toLowerCase()))) {
      candidates.push(directory);
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        pending.push(path.join(directory, entry.name));
      }
    }
  }

  return candidates;
}

function openZip(archivePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error("Unable to open ZIP archive."));
      } else {
        resolve(zipFile);
      }
    });
  });
}

function readEntries(zipFile: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    const fail = (error: Error) => reject(error);

    zipFile.once("error", fail);
    zipFile.on("entry", (entry) => {
      try {
        validateArchiveEntryPath(entry.fileName);
        entries.push(entry);
        zipFile.readEntry();
      } catch (error) {
        reject(error);
        zipFile.close();
      }
    });
    zipFile.once("end", () => {
      zipFile.removeListener("error", fail);
      resolve(entries);
    });
    zipFile.readEntry();
  });
}

export function selectRuntimeArchiveEntries(
  entries: Pick<Entry, "fileName" | "externalFileAttributes">[],
  expectedFiles: string[]
): { candidateDirectory: string; files: string[] } {
  const expected = new Set(expectedFiles.map((file) => file.toLowerCase()));
  const candidateDirectories = new Set<string>();

  for (const entry of entries) {
    const normalized = entry.fileName.replaceAll("\\", "/");
    const baseName = path.posix.basename(normalized).toLowerCase();
    if (expected.has(baseName)) {
      candidateDirectories.add(path.posix.dirname(normalized));
    }
  }

  const completeCandidates = [...candidateDirectories].filter((directory) => {
    const names = new Set(
      entries
        .map((entry) => entry.fileName.replaceAll("\\", "/"))
        .filter((name) => path.posix.dirname(name) === directory)
        .map((name) => path.posix.basename(name).toLowerCase())
    );
    return [...expected].every((file) => names.has(file));
  });

  if (completeCandidates.length !== 1) {
    throw new Error(
      `Archive must contain exactly one directory with ${expectedFiles.join(", ")}.`
    );
  }

  const candidateDirectory = completeCandidates[0];
  const files = entries
    .map((entry) => entry.fileName.replaceAll("\\", "/"))
    .filter((name) => {
      if (path.posix.dirname(name) !== candidateDirectory) return false;
      const baseName = path.posix.basename(name).toLowerCase();
      const extension = path.posix.extname(name).toLowerCase();
      return expected.has(baseName) || extension === ".dll";
    });

  return { candidateDirectory, files };
}

function openEntryStream(zipFile: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error(`Unable to read archive entry ${entry.fileName}.`));
      } else {
        resolve(stream);
      }
    });
  });
}

async function extractSelectedEntries(
  archivePath: string,
  extractionRoot: string,
  expectedFiles: string[]
): Promise<void> {
  const listingZip = await openZip(archivePath);
  const entries = await readEntries(listingZip);
  listingZip.close();
  const selection = selectRuntimeArchiveEntries(entries, expectedFiles);
  const selectedNames = new Set(selection.files);
  logEvent("info", "archive", "Runtime archive entries selected.", {
    archive: path.basename(archivePath),
    totalEntries: entries.length,
    selectedEntries: selection.files.length,
    directory: selection.candidateDirectory
  });

  const extractionZip = await openZip(archivePath);
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => reject(error);
    extractionZip.once("error", fail);
    extractionZip.on("entry", async (entry) => {
      try {
        const normalized = entry.fileName.replaceAll("\\", "/");
        if (selectedNames.has(normalized)) {
          const outputPath = path.join(extractionRoot, path.posix.basename(normalized));
          const readStream = await openEntryStream(extractionZip, entry);
          await pipeline(readStream, createWriteStream(outputPath, { flags: "wx" }));
        }
        extractionZip.readEntry();
      } catch (error) {
        reject(error);
        extractionZip.close();
      }
    });
    extractionZip.once("end", () => {
      extractionZip.removeListener("error", fail);
      resolve();
    });
    extractionZip.readEntry();
  });
  extractionZip.close();
}

export async function extractZipSafely(input: {
  archivePath: string;
  destinationPath: string;
  expectedFiles: string[];
  tempRoot: string;
}): Promise<void> {
  const extractionRoot = path.join(input.tempRoot, `extract-${randomUUID()}`);
  const stagingPath = `${input.destinationPath}.staging-${randomUUID()}`;
  await mkdir(extractionRoot, { recursive: true });
  const startedAt = Date.now();
  logEvent("info", "archive", "Runtime archive extraction started.", {
    archive: path.basename(input.archivePath),
    destination: input.destinationPath
  });

  try {
    await extractSelectedEntries(input.archivePath, extractionRoot, input.expectedFiles);
    await cp(extractionRoot, stagingPath, { recursive: true, force: false });

    for (const expectedFile of input.expectedFiles) {
      const info = await stat(path.join(stagingPath, expectedFile));
      if (!info.isFile()) {
        throw new Error(`Expected archive file is not a regular file: ${expectedFile}`);
      }
    }

    await mkdir(path.dirname(input.destinationPath), { recursive: true });
    await rm(input.destinationPath, { recursive: true, force: true });
    await rename(stagingPath, input.destinationPath);
    logEvent("info", "archive", "Runtime archive extraction completed.", {
      archive: path.basename(input.archivePath),
      durationMs: Date.now() - startedAt,
      destination: input.destinationPath
    });
  } catch (error) {
    logError("archive", "Runtime archive extraction failed.", error, {
      archive: path.basename(input.archivePath),
      durationMs: Date.now() - startedAt
    });
    throw error;
  } finally {
    await rm(extractionRoot, { recursive: true, force: true }).catch(() => undefined);
    await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
  }
}
