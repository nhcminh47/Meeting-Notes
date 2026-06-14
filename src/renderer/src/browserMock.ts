import type {
  LocalStudioApi,
  LogEvent,
  StartTranscriptionJobInput,
  TranscriptionJobStatus
} from "../../shared/apiTypes";
import type { RuntimeStatus } from "../../main/runtime/runtimeTypes";

const runtimeStatus: RuntimeStatus = {
  runtimeVersion: "browser-preview",
  items: {
    ffmpeg: { id: "ffmpeg", status: "ready" },
    whisper: { id: "whisper", status: "ready" },
    modelSmall: { id: "model-small", status: "ready" },
    modelMedium: { id: "model-medium", status: "missing" }
  }
};

const events: LogEvent[] = [
  {
    id: 1,
    timestamp: new Date().toISOString(),
    level: "info",
    source: "preview",
    message: "Frontend standalone preview ready."
  }
];

let job: TranscriptionJobStatus | null = null;

function createJob(input: StartTranscriptionJobInput): TranscriptionJobStatus {
  return {
    jobId: "00000000-0000-4000-8000-000000000001",
    state: "transcribing",
    progress: 42,
    phase: `Previewing ${input.model ?? "small"} model locally`,
    canPause: true,
    canResume: false,
    canStop: true
  };
}

const browserApi: LocalStudioApi = {
  windowControls: {
    minimize: async () => undefined,
    toggleMaximize: async () => false,
    isMaximized: async () => false,
    close: async () => undefined,
    onMaximizedChange: () => () => undefined
  },
  runtime: {
    getStatus: async () => runtimeStatus,
    ensureRequired: async () => runtimeStatus,
    installItem: async () => runtimeStatus,
    repair: async () => runtimeStatus
  },
  audio: {
    pickFile: async () => ({
      path: "browser-preview://demo-meeting.wav",
      name: "demo-meeting.wav"
    }),
    convertToWav16k: async () => ({
      jobId: "browser-preview",
      outputPath: "browser-preview://converted.wav"
    })
  },
  transcribe: {
    start: async (input) => {
      job = createJob(input);
      return job;
    },
    getStatus: async () => job ?? createJob({ inputPath: "browser-preview" }),
    pause: async () => {
      job = {
        ...(job ?? createJob({ inputPath: "browser-preview" })),
        state: "paused",
        phase: "Preview paused",
        canPause: false,
        canResume: true
      };
      return job;
    },
    resume: async () => {
      job = {
        ...(job ?? createJob({ inputPath: "browser-preview" })),
        state: "transcribing",
        phase: "Previewing transcription locally",
        canPause: true,
        canResume: false
      };
      return job;
    },
    stop: async () => {
      job = {
        ...(job ?? createJob({ inputPath: "browser-preview" })),
        state: "stopped",
        phase: "Preview stopped",
        canPause: false,
        canResume: false,
        canStop: false
      };
      return job;
    }
  },
  diagnostics: {
    getEvents: async () => ({
      events,
      logFilePath: "Browser preview - no persistent log file"
    })
  }
};

export function installBrowserMock(): void {
  if (!window.localStudio) window.localStudio = browserApi;
}
