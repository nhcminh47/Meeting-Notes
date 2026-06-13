import type { RuntimeManifest } from "./runtimeTypes";

const MODEL_COMMIT = "5359861c739e955e79d9a303bcbc70fb988958b1";

export const DEFAULT_RUNTIME_MANIFEST: RuntimeManifest = {
  runtimeVersion: "2026.06.11",
  platform: "win32-x64",
  items: {
    ffmpeg: {
      id: "ffmpeg",
      type: "zip",
      url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-06-10-17-02/ffmpeg-n8.1.1-11-ge4c7fbf6c0-win64-gpl-8.1.zip",
      sha256: "b2938943fcc19bc9b90fd1e5c1f437fb46f3889eef5dbbef4ab4808ac6866830",
      sizeBytes: 220783075,
      extractTo: "runtime/bin/ffmpeg",
      expectedFiles: ["ffmpeg.exe", "ffprobe.exe"]
    },
    whisper: {
      id: "whisper",
      type: "zip",
      url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-bin-x64.zip",
      sha256: "b07ea0b1b4115a38e1a7b07debf581f0b77d999925f8acb8f39d322b0ba0a822",
      sizeBytes: 4093849,
      extractTo: "runtime/bin/whisper",
      expectedFiles: ["whisper-cli.exe"]
    },
    modelSmall: {
      id: "model-small",
      type: "file",
      url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${MODEL_COMMIT}/ggml-small.bin`,
      sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
      sizeBytes: 487601967,
      outputPath: "runtime/models/ggml-small.bin"
    },
    modelMedium: {
      id: "model-medium",
      type: "file",
      url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${MODEL_COMMIT}/ggml-medium.bin`,
      sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
      sizeBytes: 1533763059,
      outputPath: "runtime/models/ggml-medium.bin",
      optional: true
    }
  }
};
