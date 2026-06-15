import type { RuntimeStatus } from "../main/runtime/runtimeTypes";

export type AudioFileSelection = {
  path: string;
  name: string;
};

export type RecordingState =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "recorded"
  | "transcribing"
  | "error";

export type SaveRecordingInput = {
  data: Uint8Array;
  mimeType: string;
  durationMs: number;
};

export type RecordingEventInput = {
  event:
    | "permission-granted"
    | "permission-denied"
    | "started"
    | "stopped"
    | "transcribe-requested"
    | "error";
  mimeType?: string;
  durationMs?: number;
  message?: string;
};

export type ConvertAudioRequest = {
  inputPath: string;
};

export type ConvertAudioResult = {
  jobId: string;
  outputPath: string;
};

export type TranscribeAudioInput = {
  audioPath: string;
  model?: "small" | "medium";
  language?: "vi" | "en" | "auto";
  outputFormat?: "txt" | "json" | "srt";
};

export type TranscriptionResult = {
  text: string;
  outputFiles: string[];
};

export type TranscriptionJobState =
  | "queued"
  | "converting"
  | "transcribing"
  | "paused"
  | "completed"
  | "stopped"
  | "error";

export type StartTranscriptionJobInput = {
  inputPath: string;
  model?: "small" | "medium";
  language?: "vi" | "en" | "auto";
  outputFormat?: "txt" | "json" | "srt";
  cpuThreads?: number;
  debugMode?: boolean;
};

export type TranscriptionJobStatus = {
  jobId: string;
  state: TranscriptionJobState;
  progress: number;
  phase: string;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  result?: TranscriptionResult;
  error?: string;
};

export type LogEvent = {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  details?: Record<string, string | number | boolean>;
};

export type LogSnapshot = {
  events: LogEvent[];
  logFilePath: string;
};

export type LocalStudioApi = {
  windowControls: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    isMaximized: () => Promise<boolean>;
    close: () => Promise<void>;
    onMaximizedChange: (listener: (maximized: boolean) => void) => () => void;
  };
  runtime: {
    getStatus: () => Promise<RuntimeStatus>;
    ensureRequired: () => Promise<RuntimeStatus>;
    installItem: (itemId: string) => Promise<RuntimeStatus>;
    repair: () => Promise<RuntimeStatus>;
  };
  audio: {
    pickFile: () => Promise<AudioFileSelection | null>;
    convertToWav16k: (input: ConvertAudioRequest) => Promise<ConvertAudioResult>;
    saveRecording: (input: SaveRecordingInput) => Promise<AudioFileSelection>;
    keepRecording: (path: string) => Promise<void>;
    discardRecording: (path: string) => Promise<void>;
    reportRecordingEvent: (input: RecordingEventInput) => Promise<void>;
  };
  transcribe: {
    start: (input: StartTranscriptionJobInput) => Promise<TranscriptionJobStatus>;
    getStatus: (jobId: string) => Promise<TranscriptionJobStatus>;
    pause: (jobId: string) => Promise<TranscriptionJobStatus>;
    resume: (jobId: string) => Promise<TranscriptionJobStatus>;
    stop: (jobId: string) => Promise<TranscriptionJobStatus>;
  };
  diagnostics: {
    getEvents: () => Promise<LogSnapshot>;
  };
};
