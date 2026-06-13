import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { getRuntimeExecutablePaths } from "../runtime/runtimeManager";
import { runProcess } from "../processRunner";
import { logEvent } from "../eventLogger";

export type ConvertAudioInput = {
  inputPath: string;
  outputPath: string;
  signal?: AbortSignal;
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

export async function convertToWav16kMono(
  input: ConvertAudioInput
): Promise<{ outputPath: string }> {
  const { ffmpegExe } = getRuntimeExecutablePaths();
  await assertFile(input.inputPath, "Input audio");
  await assertFile(ffmpegExe, "FFmpeg executable");
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  logEvent("info", "audio", "Audio conversion started.", {
    input: input.inputPath,
    output: input.outputPath
  });

  await runProcess(
    ffmpegExe,
    [
      "-y",
      "-i",
      input.inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      input.outputPath
    ],
    { cwd: path.dirname(ffmpegExe), signal: input.signal }
  );
  await assertFile(input.outputPath, "Converted WAV");
  logEvent("info", "audio", "Audio conversion completed.", { output: input.outputPath });
  return { outputPath: input.outputPath };
}
