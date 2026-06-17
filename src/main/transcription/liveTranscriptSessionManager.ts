import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { convertToWav16kMono } from "../audio/ffmpegService";
import { logError, logEvent } from "../eventLogger";
import { getRuntimePaths } from "../runtime/runtimePaths";
import { transcribeAudioFile } from "./whisperService";
import type {
  FinishLiveTranscriptSessionInput,
  FinishLiveTranscriptSessionResult,
  LiveTranscriptChunkInput,
  LiveTranscriptChunkResult,
  StartLiveTranscriptSessionInput
} from "../../shared/apiTypes";

type LiveSession = {
  sessionId: string;
  input: StartLiveTranscriptSessionInput;
  sessionRoot: string;
  queue: Promise<void>;
  pending: number;
  cancelled: boolean;
};

type LiveTranscriptValidation = {
  text: string;
  rejectionReason?: string;
};

const sessions = new Map<string, LiveSession>();

const LIVE_RECORDING_FORMATS = new Map([
  ["audio/wav", ".wav"],
  ["audio/wave", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/webm", ".webm"],
  ["audio/webm;codecs=opus", ".webm"],
  ["audio/ogg", ".ogg"],
  ["audio/ogg;codecs=opus", ".ogg"]
]);

function getSession(sessionId: string): LiveSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Unknown live transcript session: ${sessionId}`);
  return session;
}

function extensionFor(mimeType: string): string {
  const extension = LIVE_RECORDING_FORMATS.get(mimeType.toLowerCase().replace(/\s/g, ""));
  if (!extension) throw new Error("Unsupported live recording format.");
  return extension;
}

function chunkBaseName(index: number): string {
  return `chunk-${index.toString().padStart(5, "0")}`;
}

function waitingForSpeechResult(
  session: LiveSession,
  input: LiveTranscriptChunkInput
): LiveTranscriptChunkResult {
  return {
    sessionId: session.sessionId,
    chunkIndex: input.chunkIndex,
    text: "",
    status: "waiting for speech",
    queueDepth: Math.max(0, session.pending - 1)
  };
}

function isRecoverableLiveConversionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid data|end of file|ebml|error opening input|could not find codec parameters/i.test(
    message
  );
}

function transcriptFileName(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  return `live-transcript-${stamp}.txt`;
}

function normalizeForLiveFilter(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRepetitiveLiveText(normalized: string): boolean {
  const phrases = normalized
    .split(/\b(?:va|roi|nha)\b|[.!?\n]+/i)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length >= 6);
  const counts = new Map<string, number>();
  for (const phrase of phrases) counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  if ([...counts.values()].some((count) => count >= 3)) return true;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  const windowCounts = new Map<string, number>();
  for (let index = 0; index <= words.length - 3; index += 1) {
    const key = words.slice(index, index + 3).join(" ");
    windowCounts.set(key, (windowCounts.get(key) ?? 0) + 1);
  }
  return [...windowCounts.values()].some((count) => count >= 3);
}

export function validateLiveTranscriptText(
  text: string,
  input: { durationMs: number; language?: StartLiveTranscriptSessionInput["language"] }
): LiveTranscriptValidation {
  const trimmed = text.trim();
  const normalized = normalizeForLiveFilter(trimmed);
  if (normalized.length < 2) return { text: "", rejectionReason: "near-empty" };

  const boilerplatePatterns = [
    /\bsubscribe\b/,
    /\bdang ky\b/,
    /\bkenh\b.*\bvideo\b/,
    /\bhen gap lai\b/,
    /\bghien mi go\b/,
    /\bmi ghien mi go\b/,
    /\bla la school\b/,
    /\bkhong bo lo nhung video hap dan\b/
  ];
  const selectedLanguage = input.language ?? "vi";
  if (
    (selectedLanguage === "vi" || selectedLanguage === "auto") &&
    boilerplatePatterns.some((pattern) => pattern.test(normalized))
  ) {
    return { text: "", rejectionReason: "vietnamese-boilerplate" };
  }

  if (isRepetitiveLiveText(normalized)) {
    return { text: "", rejectionReason: "repetitive-text" };
  }

  const durationSeconds = Math.max(1, input.durationMs / 1000);
  const maxCharacters = Math.max(80, Math.round(durationSeconds * 36));
  if (trimmed.replace(/\s/g, "").length > maxCharacters) {
    return { text: "", rejectionReason: "implausibly-long" };
  }

  return { text: trimmed };
}

async function processChunk(
  session: LiveSession,
  input: LiveTranscriptChunkInput
): Promise<LiveTranscriptChunkResult> {
  if (session.cancelled) throw new Error("Live transcript session was cancelled.");
  const extension = extensionFor(input.mimeType);
  const chunkRoot = path.join(session.sessionRoot, "chunks", chunkBaseName(input.chunkIndex));
  const sourcePath = path.join(chunkRoot, `audio${extension}`);
  const wavPath = path.join(chunkRoot, "audio.wav");
  const transcriptPrefix = path.join(chunkRoot, "transcript");

  await mkdir(chunkRoot, { recursive: true });
  await writeFile(sourcePath, input.data);
  logEvent("info", "live-transcript", "Live transcript chunk saved.", {
    sessionId: session.sessionId,
    chunkIndex: input.chunkIndex,
    mimeType: input.mimeType,
    durationMs: input.durationMs,
    bytes: input.data.byteLength
  });

  logEvent("info", "live-transcript", "Live transcript chunk conversion started.", {
    sessionId: session.sessionId,
    chunkIndex: input.chunkIndex
  });
  try {
    await convertToWav16kMono({ inputPath: sourcePath, outputPath: wavPath });
  } catch (error) {
    if (!isRecoverableLiveConversionError(error)) throw error;
    logEvent("warn", "live-transcript", "Live transcript chunk skipped.", {
      sessionId: session.sessionId,
      chunkIndex: input.chunkIndex,
      reason: "undecodable-audio-segment",
      message: error instanceof Error ? error.message : String(error)
    });
    await rm(chunkRoot, { recursive: true, force: true }).catch(() => undefined);
    return waitingForSpeechResult(session, input);
  }
  logEvent("info", "live-transcript", "Live transcript chunk conversion completed.", {
    sessionId: session.sessionId,
    chunkIndex: input.chunkIndex
  });

  logEvent("info", "live-transcript", "Live transcript chunk transcription started.", {
    sessionId: session.sessionId,
    chunkIndex: input.chunkIndex
  });
  const result = await transcribeAudioFile({
    audioPath: wavPath,
    model: session.input.model,
    language: session.input.language,
    outputFormat: "txt",
    cpuThreads: session.input.cpuThreads,
    debugMode: session.input.debugMode,
    liveChunkMode: true,
    outputPrefix: transcriptPrefix
  });
  const validation = validateLiveTranscriptText(result.text, {
    durationMs: input.durationMs,
    language: session.input.language
  });
  if (validation.rejectionReason) {
    logEvent("warn", "live-transcript", "Live transcript chunk rejected.", {
      sessionId: session.sessionId,
      chunkIndex: input.chunkIndex,
      reason: validation.rejectionReason,
      textLength: result.text.length
    });
  }
  logEvent("info", "live-transcript", "Live transcript chunk transcription completed.", {
    sessionId: session.sessionId,
    chunkIndex: input.chunkIndex,
    textLength: validation.text.length
  });

  await rm(chunkRoot, { recursive: true, force: true }).catch(() => undefined);
  const text = validation.text;
  return {
    sessionId: session.sessionId,
    chunkIndex: input.chunkIndex,
    text,
    status: text ? "appended" : "waiting for speech",
    queueDepth: Math.max(0, session.pending - 1)
  };
}

export function startLiveTranscriptSession(
  input: StartLiveTranscriptSessionInput
): { sessionId: string } {
  const sessionId = randomUUID();
  const sessionRoot = path.join(getRuntimePaths().workRoot, "live-transcripts", sessionId);
  sessions.set(sessionId, {
    sessionId,
    input,
    sessionRoot,
    queue: Promise.resolve(),
    pending: 0,
    cancelled: false
  });
  logEvent("info", "live-transcript", "Live transcript recording started.", {
    sessionId,
    model: input.model ?? "small",
    language: input.language ?? "vi"
  });
  return { sessionId };
}

export function enqueueLiveTranscriptChunk(
  input: LiveTranscriptChunkInput
): Promise<LiveTranscriptChunkResult> {
  const session = getSession(input.sessionId);
  session.pending += 1;
  const run = session.queue
    .catch(() => undefined)
    .then(() => processChunk(session, input))
    .catch((error) => {
      logError("live-transcript", "Live transcript chunk failed.", error, {
        sessionId: session.sessionId,
        chunkIndex: input.chunkIndex
      });
      throw error;
    })
    .finally(() => {
      session.pending = Math.max(0, session.pending - 1);
    });
  session.queue = run.then(() => undefined, () => undefined);
  return run;
}

export async function finishLiveTranscriptSession(
  input: FinishLiveTranscriptSessionInput
): Promise<FinishLiveTranscriptSessionResult> {
  const session = getSession(input.sessionId);
  await session.queue;
  const outputFiles: string[] = [];
  const text = input.finalText.trim();
  if (input.saveTranscript && text) {
    const transcriptPath = path.join(session.sessionRoot, transcriptFileName());
    await mkdir(path.dirname(transcriptPath), { recursive: true });
    await writeFile(transcriptPath, text, "utf8");
    outputFiles.push(transcriptPath);
    logEvent("info", "live-transcript", "Live transcript file saved.", {
      sessionId: session.sessionId,
      path: transcriptPath
    });
  } else {
    await rm(session.sessionRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  sessions.delete(session.sessionId);
  logEvent("info", "live-transcript", "Live transcript recording stopped.", {
    sessionId: session.sessionId,
    textLength: text.length
  });
  return { sessionId: session.sessionId, text, outputFiles };
}

export async function cancelLiveTranscriptSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId);
  session.cancelled = true;
  await session.queue.catch(() => undefined);
  await rm(session.sessionRoot, { recursive: true, force: true }).catch(() => undefined);
  sessions.delete(sessionId);
  logEvent("warn", "live-transcript", "Live transcript session cancelled.", {
    sessionId
  });
}

export async function cancelAllLiveTranscriptSessions(): Promise<void> {
  await Promise.all(
    [...sessions.keys()].map((sessionId) =>
      cancelLiveTranscriptSession(sessionId).catch(() => undefined)
    )
  );
}
