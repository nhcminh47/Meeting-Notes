import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { LogEvent, LogSnapshot } from "../shared/apiTypes";

const MAX_MEMORY_EVENTS = 300;
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const events: LogEvent[] = [];
let nextId = 1;
let writeQueue: Promise<void> = Promise.resolve();
let logRoot = path.join(os.tmpdir(), "local-whisper-studio");

function getLogFilePath(): string {
  return path.join(logRoot, "logs", "events.jsonl");
}

export function setEventLogRoot(root: string): void {
  logRoot = path.resolve(root);
}

function normalizeDetails(
  details?: Record<string, unknown>
): Record<string, string | number | boolean> | undefined {
  if (!details) return undefined;
  const normalized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === "string") normalized[key] = value.slice(0, 2000);
    else if (typeof value === "number" && Number.isFinite(value)) normalized[key] = value;
    else if (typeof value === "boolean") normalized[key] = value;
    else if (value instanceof Error) normalized[key] = value.message.slice(0, 2000);
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

async function rotateIfNeeded(logFilePath: string): Promise<void> {
  try {
    if ((await stat(logFilePath)).size < MAX_LOG_BYTES) return;
    await rename(logFilePath, `${logFilePath}.previous`).catch(async () => {
      const { rm } = await import("node:fs/promises");
      await rm(`${logFilePath}.previous`, { force: true });
      await rename(logFilePath, `${logFilePath}.previous`);
    });
  } catch {
    // A missing log file needs no rotation.
  }
}

export function logEvent(
  level: LogEvent["level"],
  source: string,
  message: string,
  details?: Record<string, unknown>
): LogEvent {
  const event: LogEvent = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    level,
    source: source.slice(0, 80),
    message: message.slice(0, 2000),
    details: normalizeDetails(details)
  };
  events.push(event);
  if (events.length > MAX_MEMORY_EVENTS) events.splice(0, events.length - MAX_MEMORY_EVENTS);

  const logFilePath = getLogFilePath();
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(path.dirname(logFilePath), { recursive: true });
      await rotateIfNeeded(logFilePath);
      await appendFile(logFilePath, `${JSON.stringify(event)}\n`, "utf8");
    })
    .catch(() => undefined);
  return event;
}

export function logError(
  source: string,
  message: string,
  error: unknown,
  details?: Record<string, unknown>
): LogEvent {
  return logEvent("error", source, message, {
    ...details,
    error: error instanceof Error ? error.message : String(error)
  });
}

export function getLogSnapshot(): LogSnapshot {
  return {
    events: events.map((event) => ({
      ...event,
      details: event.details ? { ...event.details } : undefined
    })),
    logFilePath: getLogFilePath()
  };
}

export async function flushEventLog(): Promise<void> {
  await writeQueue;
}
