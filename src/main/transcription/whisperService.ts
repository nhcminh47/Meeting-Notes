import { mkdir, readFile, stat } from "node:fs/promises";
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

async function assertFile(filePath: string, label: string): Promise<void> {
  try {
    if (!(await stat(filePath)).isFile()) {
      throw new Error();
    }
  } catch {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
}

function outputFlag(format: "txt" | "json" | "srt"): string {
  return { txt: "-otxt", json: "-oj", srt: "-osrt" }[format];
}

function jsonToText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidate = value as {
    text?: unknown;
    transcription?: Array<{ text?: unknown }>;
  };
  if (typeof candidate.text === "string") return candidate.text;
  if (Array.isArray(candidate.transcription)) {
    return candidate.transcription
      .map((segment) => (typeof segment.text === "string" ? segment.text : ""))
      .join("")
      .trim();
  }
  return "";
}

export async function transcribeAudioFile(
  input: TranscribeAudioInput & {
    outputPrefix?: string;
    signal?: AbortSignal;
    cpuThreads?: number;
    onProgress?: (progress: number) => void;
  }
): Promise<TranscriptionResult> {
  const model = input.model ?? "small";
  const language = input.language ?? "vi";
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
  logEvent("info", "transcription", "Transcription started.", {
    model,
    language,
    outputFormat,
    cpuThreads,
    audioPath: input.audioPath
  });

  let progressBuffer = "";
  const handleProgressOutput = (text: string) => {
    progressBuffer = `${progressBuffer}${text}`.slice(-4096);
    for (const match of progressBuffer.matchAll(/progress\s*=\s*(\d+)%/gi)) {
      input.onProgress?.(Math.max(0, Math.min(Number(match[1]), 100)));
    }
    const lastNewline = Math.max(progressBuffer.lastIndexOf("\n"), progressBuffer.lastIndexOf("\r"));
    if (lastNewline >= 0) progressBuffer = progressBuffer.slice(lastNewline + 1);
  };

  await runProcess(
    runtime.whisperExe,
    [
      "-m",
      modelPath,
      "-f",
      input.audioPath,
      "-l",
      language,
      "-t",
      String(cpuThreads),
      "-pp",
      "-of",
      transcriptPrefix,
      outputFlag(outputFormat)
    ],
    {
      cwd: path.dirname(runtime.whisperExe),
      signal: input.signal,
      onStdout: handleProgressOutput,
      onStderr: handleProgressOutput
    }
  );
  await assertFile(outputPath, "Transcript output");

  const content = await readFile(outputPath, "utf8");
  const text = outputFormat === "json" ? jsonToText(JSON.parse(content)) : content.trim();
  logEvent("info", "transcription", "Transcription completed.", {
    model,
    outputFormat,
    outputPath,
    textLength: text.length
  });
  return { text, outputFiles: [outputPath] };
}
