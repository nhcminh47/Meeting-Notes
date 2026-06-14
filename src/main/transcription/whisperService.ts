import { open, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { getRuntimeExecutablePaths } from "../runtime/runtimeManager";
import { createWorkPaths } from "../runtime/runtimePaths";
import { runProcess } from "../processRunner";
import { logEvent } from "../eventLogger";
import type {
  TranscribeAudioInput,
  TranscriptionResult
} from "../../shared/apiTypes";

type UiLanguage = NonNullable<TranscribeAudioInput["language"]>;
type OutputFormat = NonNullable<TranscribeAudioInput["outputFormat"]>;

type DecoderConfig = {
  noSpeechThreshold: number;
  logprobThreshold: number;
  entropyThreshold: number;
  temperature: number;
  temperatureIncrement: number;
};

type OutputAnalysis = {
  text: string;
  segmentCount: number;
  rejectedSegmentCount: number | "unavailable";
  skippedSegmentCount: number | "unavailable";
  lastSegmentEndSeconds?: number;
};

const DEFAULT_DECODER: DecoderConfig = {
  noSpeechThreshold: 0.6,
  logprobThreshold: -1,
  entropyThreshold: 2.4,
  temperature: 0,
  temperatureIncrement: 0.2
};

const RELAXED_DECODER: DecoderConfig = {
  noSpeechThreshold: 0.8,
  logprobThreshold: -1.5,
  entropyThreshold: 3,
  temperature: 0,
  temperatureIncrement: 0.2
};

async function assertFile(filePath: string, label: string): Promise<void> {
  try {
    if (!(await stat(filePath)).isFile()) {
      throw new Error();
    }
  } catch {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
}

function outputFlag(format: OutputFormat): string {
  return { txt: "-otxt", json: "-oj", srt: "-osrt" }[format];
}

export function resolveWhisperLanguage(language: UiLanguage): "auto" | "en" | "vi" {
  if (language === "auto") return "auto";
  return language === "en" ? "en" : "vi";
}

function jsonSegments(value: unknown): Array<{ text?: unknown; timestamps?: unknown }> {
  if (!value || typeof value !== "object") return [];
  const transcription = (value as { transcription?: unknown }).transcription;
  return Array.isArray(transcription) ? transcription : [];
}

function jsonToText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidate = value as { text?: unknown };
  if (typeof candidate.text === "string") return candidate.text;
  return jsonSegments(value)
    .map((segment) => (typeof segment.text === "string" ? segment.text : ""))
    .join("")
    .trim();
}

function parseTimestampSeconds(value: string): number | undefined {
  const match = value.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return undefined;
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

function countDiagnostics(text: string, pattern: RegExp): number | "unavailable" {
  const matches = text.match(pattern);
  return matches ? matches.length : "unavailable";
}

function analyzeOutput(
  format: OutputFormat,
  content: string,
  processOutput: string
): OutputAnalysis {
  let text = content.trim();
  let segmentCount = 0;
  let lastSegmentEndSeconds: number | undefined;

  if (format === "json") {
    const parsed = JSON.parse(content);
    const segments = jsonSegments(parsed);
    text = jsonToText(parsed);
    segmentCount = segments.length;
    const timestamps = segments.at(-1)?.timestamps;
    if (timestamps && typeof timestamps === "object") {
      const to = (timestamps as { to?: unknown }).to;
      if (typeof to === "string") lastSegmentEndSeconds = parseTimestampSeconds(to);
    }
  } else if (format === "srt") {
    const timestampLines = content.match(
      /^\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}$/gm
    );
    segmentCount = timestampLines?.length ?? 0;
    const lastTimestamp = timestampLines?.at(-1)?.split("-->")[1]?.trim();
    if (lastTimestamp) lastSegmentEndSeconds = parseTimestampSeconds(lastTimestamp);
  } else {
    segmentCount = content.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  }

  return {
    text,
    segmentCount,
    rejectedSegmentCount: countDiagnostics(processOutput, /\breject(?:ed|ing)?\b/gi),
    skippedSegmentCount: countDiagnostics(
      processOutput,
      /\bskip(?:ped|ping)?(?:\s+(?:segment|audio|silence|no[- ]speech))?\b/gi
    ),
    lastSegmentEndSeconds
  };
}

async function readWavDurationSeconds(audioPath: string): Promise<number | undefined> {
  const handle = await open(audioPath, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const data = buffer.subarray(0, bytesRead);
    if (data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WAVE") {
      return undefined;
    }

    let byteRate: number | undefined;
    let dataSize: number | undefined;
    for (let offset = 12; offset + 8 <= data.length; ) {
      const chunkId = data.toString("ascii", offset, offset + 4);
      const chunkSize = data.readUInt32LE(offset + 4);
      if (chunkId === "fmt " && offset + 16 <= data.length) {
        byteRate = data.readUInt32LE(offset + 12);
      } else if (chunkId === "data") {
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    return byteRate && dataSize !== undefined ? dataSize / byteRate : undefined;
  } finally {
    await handle.close();
  }
}

function buildArgs(input: {
  modelPath: string;
  audioPath: string;
  languageArgument: string;
  cpuThreads: number;
  transcriptPrefix: string;
  outputFormat: OutputFormat;
  decoder: DecoderConfig;
}): string[] {
  const args = [
    "-m",
    input.modelPath,
    "-f",
    input.audioPath,
    "-t",
    String(input.cpuThreads),
    "-nth",
    String(input.decoder.noSpeechThreshold),
    "-lpt",
    String(input.decoder.logprobThreshold),
    "-et",
    String(input.decoder.entropyThreshold),
    "-tp",
    String(input.decoder.temperature),
    "-tpi",
    String(input.decoder.temperatureIncrement),
    "-pp",
    "-of",
    input.transcriptPrefix,
    outputFlag(input.outputFormat)
  ];
  args.splice(4, 0, "-l", input.languageArgument);
  return args;
}

function commandLine(executable: string, args: string[]): string {
  return [executable, ...args]
    .map((value) => (/\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value))
    .join(" ");
}

function logRuntimeConfig(details: {
  selectedLanguage: UiLanguage;
  resolvedLanguage: string;
  model: string;
  modelPath: string;
  audioPath: string;
  audioDurationSeconds?: number;
  outputFormat: OutputFormat;
  cpuThreads: number;
  decoder: DecoderConfig;
  executable: string;
  args: string[];
  retry: boolean;
}): void {
  logEvent("info", "transcription", "Whisper runtime configuration resolved.", {
    selectedLanguage: details.selectedLanguage,
    resolvedLanguageArgument: details.resolvedLanguage,
    taskMode: "transcribe",
    modelName: details.model,
    modelPath: details.modelPath,
    audioPath: details.audioPath,
    whisperExecutable: details.executable,
    commandArgs: JSON.stringify(details.args),
    vadEnabled: false,
    chunkingEnabled: false,
    noSpeechThreshold: details.decoder.noSpeechThreshold,
    logprobThreshold: details.decoder.logprobThreshold,
    compressionRatioThreshold: "not exposed by whisper.cpp CLI",
    entropyThreshold: details.decoder.entropyThreshold,
    temperature: details.decoder.temperature,
    temperatureIncrement: details.decoder.temperatureIncrement,
    temperatureFallbackEnabled: details.decoder.temperatureIncrement > 0,
    maxSegmentLength: "default (0/unlimited CLI setting)",
    splitOnWord: false,
    maxTokens: "whisper.cpp default",
    audioDurationSeconds: details.audioDurationSeconds ?? "unavailable",
    outputFormat: details.outputFormat,
    cpuThreads: details.cpuThreads,
    retry: details.retry
  });
}

function isSuspiciouslyShort(
  language: UiLanguage,
  audioDurationSeconds: number | undefined,
  analysis: OutputAnalysis
): boolean {
  if (language === "vi" || audioDurationSeconds === undefined || audioDurationSeconds < 10) {
    return false;
  }
  const charactersPerSecond = analysis.text.replace(/\s/g, "").length / audioDurationSeconds;
  return analysis.segmentCount <= 2 && charactersPerSecond < 4;
}

export async function transcribeAudioFile(
  input: TranscribeAudioInput & {
    outputPrefix?: string;
    signal?: AbortSignal;
    cpuThreads?: number;
    debugMode?: boolean;
    onProgress?: (progress: number) => void;
  }
): Promise<TranscriptionResult> {
  const model = input.model ?? "small";
  const selectedLanguage = input.language ?? "vi";
  const languageArgument = resolveWhisperLanguage(selectedLanguage);
  const outputFormat = input.outputFormat ?? "txt";
  const cpuThreads = Math.max(
    1,
    Math.min(Math.floor(input.cpuThreads ?? os.availableParallelism()), 64)
  );
  const runtime = getRuntimeExecutablePaths();
  const modelPath = model === "medium" ? runtime.modelMedium : runtime.modelSmall;
  const work = input.outputPrefix ? null : createWorkPaths(randomUUID());
  const transcriptPrefix = input.outputPrefix ?? work!.transcriptPrefix;
  const outputPath = `${transcriptPrefix}.${outputFormat}`;

  await assertFile(input.audioPath, "Audio file");
  await assertFile(runtime.whisperExe, "whisper.cpp executable");
  await assertFile(modelPath, `${model} model`);
  await mkdir(path.dirname(transcriptPrefix), { recursive: true });
  const audioDurationSeconds = await readWavDurationSeconds(input.audioPath).catch(() => undefined);

  let progressBuffer = "";
  let highestProgress = 0;
  const handleProgressOutput = (text: string) => {
    progressBuffer = `${progressBuffer}${text}`.slice(-4096);
    for (const match of progressBuffer.matchAll(/progress\s*=\s*(\d+)%/gi)) {
      highestProgress = Math.max(highestProgress, Number(match[1]));
      input.onProgress?.(Math.max(0, Math.min(Number(match[1]), 100)));
    }
    const lastNewline = Math.max(progressBuffer.lastIndexOf("\n"), progressBuffer.lastIndexOf("\r"));
    if (lastNewline >= 0) progressBuffer = progressBuffer.slice(lastNewline + 1);
  };

  const execute = async (decoder: DecoderConfig, retry: boolean) => {
    const args = buildArgs({
      modelPath,
      audioPath: input.audioPath,
      languageArgument,
      cpuThreads,
      transcriptPrefix,
      outputFormat,
      decoder
    });
    logRuntimeConfig({
      selectedLanguage,
      resolvedLanguage: languageArgument,
      model,
      modelPath,
      audioPath: input.audioPath,
      audioDurationSeconds,
      outputFormat,
      cpuThreads,
      decoder,
      executable: runtime.whisperExe,
      args,
      retry
    });
    if (input.debugMode) {
      logEvent("info", "transcription-debug", "Whisper command prepared.", {
        command: commandLine(runtime.whisperExe, args),
        appDebugMode: true,
        whisperCppDebugMode: false
      });
    }

    const processResult = await runProcess(runtime.whisperExe, args, {
      cwd: path.dirname(runtime.whisperExe),
      signal: input.signal,
      onStdout: handleProgressOutput,
      onStderr: handleProgressOutput
    });
    await assertFile(outputPath, "Transcript output");
    const content = await readFile(outputPath, "utf8");
    const processOutput = `${processResult.stdout}\n${processResult.stderr}`;
    let analysis: OutputAnalysis;
    try {
      analysis = analyzeOutput(outputFormat, content, processOutput);
    } catch (error) {
      logEvent("error", "transcription", "Transcript output parsing failed.", {
        outputPath,
        outputFormat,
        outputBytes: Buffer.byteLength(content),
        partialOutputParsing: true,
        processExitCode: processResult.exitCode,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
    const stoppedEarly =
      highestProgress > 0 && highestProgress < 100
        ? `progress ended at ${highestProgress}%`
        : analysis.lastSegmentEndSeconds !== undefined &&
            audioDurationSeconds !== undefined &&
            analysis.lastSegmentEndSeconds < audioDurationSeconds * 0.75
          ? "last output segment ends well before audio duration"
          : "not indicated";

    logEvent("info", "transcription", "Whisper output analyzed.", {
      selectedLanguage,
      resolvedLanguageArgument: languageArgument,
      audioDurationSeconds: audioDurationSeconds ?? "unavailable",
      outputSegmentCount: analysis.segmentCount,
      outputTextLength: analysis.text.length,
      rejectedSegmentCount: analysis.rejectedSegmentCount,
      skippedSegmentCount: analysis.skippedSegmentCount,
      vadStopDetected: /\bvad\b.*\b(?:stop|silence|skip)/i.test(processOutput),
      noSpeechSkipDetected: /\bno[- ]speech\b.*\bskip/i.test(processOutput),
      maxTokensStopDetected: /\bmax(?:imum)?\s+tokens?\b/i.test(processOutput),
      chunkBoundaryStopDetected: /\bchunk\b.*\b(?:boundary|end|stop)/i.test(processOutput),
      timeoutDetected: false,
      processExitCode: processResult.exitCode,
      processDurationMs: processResult.durationMs,
      earlyStopAssessment: stoppedEarly,
      partialOutputParsing: false,
      retry
    });
    if (input.debugMode) {
      logEvent("info", "transcription-debug", "Whisper process diagnostics captured.", {
        stdoutLength: processResult.stdout.length,
        stderrLength: processResult.stderr.length,
        highestProgress,
        lastSegmentEndSeconds: analysis.lastSegmentEndSeconds ?? "unavailable"
      });
    }
    return analysis;
  };

  let analysis = await execute(DEFAULT_DECODER, false);
  if (isSuspiciouslyShort(selectedLanguage, audioDurationSeconds, analysis)) {
    logEvent("warn", "transcription", "Transcript appears suspiciously short; retrying once.", {
      selectedLanguage,
      resolvedLanguageArgument: languageArgument,
      audioDurationSeconds: audioDurationSeconds ?? "unavailable",
      outputSegmentCount: analysis.segmentCount,
      outputTextLength: analysis.text.length,
      retryLanguageUnchanged: true,
      retryReason: "two or fewer segments and fewer than four non-space characters per audio second"
    });
    analysis = await execute(RELAXED_DECODER, true);
  }

  logEvent("info", "transcription", "Transcription completed.", {
    model,
    selectedLanguage,
    resolvedLanguageArgument: languageArgument,
    outputFormat,
    outputPath,
    audioDurationSeconds: audioDurationSeconds ?? "unavailable",
    outputSegmentCount: analysis.segmentCount,
    textLength: analysis.text.length
  });
  return { text: analysis.text, outputFiles: [outputPath] };
}
