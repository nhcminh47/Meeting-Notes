import type { RuntimeStatus } from "../main/runtime/runtimeTypes";
import type { SpeakerFile } from "./speakers";

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

export type LiveTranscriptStatus =
  | "listening"
  | "transcribing chunk"
  | "appended"
  | "waiting for speech"
  | "catching up"
  | "stopping"
  | "error";

export type StartLiveTranscriptSessionInput = {
  model?: "small" | "medium";
  language?: "vi" | "en" | "auto";
  cpuThreads?: number;
  debugMode?: boolean;
};

export type LiveTranscriptSession = {
  sessionId: string;
};

export type LiveTranscriptChunkInput = {
  sessionId: string;
  chunkIndex: number;
  data: Uint8Array;
  mimeType: string;
  durationMs: number;
  isFinal?: boolean;
};

export type LiveTranscriptChunkResult = {
  sessionId: string;
  chunkIndex: number;
  text: string;
  status: LiveTranscriptStatus;
  queueDepth: number;
};

export type FinishLiveTranscriptSessionInput = {
  sessionId: string;
  finalText: string;
  saveTranscript?: boolean;
};

export type FinishLiveTranscriptSessionResult = {
  sessionId: string;
  text: string;
  outputFiles: string[];
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

export type RemoteSettingsView = {
  serverUrl: string | null;
  hasApiKey: boolean;
};

export type RemoteSettingsInput = {
  serverUrl?: string;
  apiKey?: string;
};

export type RemoteConnectionStatus =
  | { ok: true; status: "connected"; message: string }
  | {
      ok: false;
      status: "invalid_url" | "unauthorized" | "unreachable" | "timeout" | "error";
      message: string;
    };

export type LiveConnectionEvent =
  | { type: "session_started"; sessionId: string }
  | { type: "partial"; sessionId: string; turnId: string; speaker: string; start: number; end: number; text: string; source: "live"; isFinal: false }
  | { type: "turn_final"; sessionId: string; turnId: string; speaker: string; start: number; end: number; text: string; source: "live"; isFinal: true }
  | { type: "session_closed"; sessionId: string }
  | { type: "error"; code: string; message: string };

export type LiveMeetingState = "not_configured" | "connecting" | "connected" | "recording" | "stopping" | "stopped" | "error";
export type LiveMeetingStatus = { state: LiveMeetingState; meetingId: string | null; message: string };
export type LiveMeetingEvent =
  | { type: "status"; status: LiveMeetingStatus }
  | { type: "connection"; event: LiveConnectionEvent };

export type MeetingNoteView = {
  meetingId: string;
  status: "completed";
  source: "final-transcript.json";
  markdown: string;
};

export type ExportFormat = "txt" | "json" | "srt" | "vtt" | "md";

export type ExportMeetingInput = {
  meetingId: string;
  formats: ExportFormat[];
};

export type ExportMeetingResult = {
  ok: true;
  files: Array<{ format: ExportFormat; path: string }>;
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
  liveTranscript: {
    startSession: (
      input: StartLiveTranscriptSessionInput
    ) => Promise<LiveTranscriptSession>;
    enqueueChunk: (
      input: LiveTranscriptChunkInput
    ) => Promise<LiveTranscriptChunkResult>;
    finishSession: (
      input: FinishLiveTranscriptSessionInput
    ) => Promise<FinishLiveTranscriptSessionResult>;
    cancelSession: (sessionId: string) => Promise<void>;
  };
  diagnostics: {
    getEvents: () => Promise<LogSnapshot>;
  };
  remoteSettings: {
    get: () => Promise<RemoteSettingsView>;
    save: (input: RemoteSettingsInput) => Promise<RemoteSettingsView>;
    clearApiKey: () => Promise<RemoteSettingsView>;
    clearAll: () => Promise<RemoteSettingsView>;
    testConnection: (input: RemoteSettingsInput) => Promise<RemoteConnectionStatus>;
  };
  liveMeeting: {
    startRemoteEnglishMeeting: () => Promise<LiveMeetingStatus>;
    sendAudioChunk: (chunk: Uint8Array) => Promise<void>;
    stop: () => Promise<LiveMeetingStatus>;
    getStatus: () => Promise<LiveMeetingStatus>;
    onEvent: (listener: (event: LiveMeetingEvent) => void) => () => void;
  };
  speakers: {
    getSpeakers: (meetingId: string) => Promise<SpeakerFile>;
    renameSpeaker: (input: { meetingId: string; speakerId: string; name: string }) => Promise<SpeakerFile>;
    clearSpeakerName: (input: { meetingId: string; speakerId: string }) => Promise<SpeakerFile>;
  };
  meetingNotes: {
    get: (input: { meetingId: string }) => Promise<MeetingNoteView | null>;
    generate: (input: { meetingId: string }) => Promise<MeetingNoteView>;
    regenerate: (input: { meetingId: string }) => Promise<MeetingNoteView>;
  };
  exports: {
    exportMeeting: (input: ExportMeetingInput) => Promise<ExportMeetingResult>;
  };
};
