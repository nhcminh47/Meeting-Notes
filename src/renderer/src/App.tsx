import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AudioFileSelection,
  LogSnapshot,
  TranscriptionJobStatus
} from "../../shared/apiTypes";
import type { RuntimeStatus } from "../../main/runtime/runtimeTypes";
import type { MascotState } from "./components/atoms/CatMascot";
import { AppHeader } from "./components/organisms/AppHeader";
import {
  RuntimePanel,
  type BusyAction
} from "./components/organisms/RuntimePanel";
import { TranscriptionWorkspace } from "./components/organisms/TranscriptionWorkspace";
import { DiagnosticsPanel } from "./components/organisms/DiagnosticsPanel";

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

function mascotState(
  ready: boolean,
  job: TranscriptionJobStatus | null,
  hasError: boolean
): MascotState {
  if (hasError || job?.state === "error" || job?.state === "stopped") return "error";
  if (job?.state === "completed") return "completed";
  if (job?.state === "paused") return "paused";
  if (job && ["queued", "converting", "transcribing"].includes(job.state)) {
    return "processing";
  }
  return ready ? "ready" : "setup";
}

export default function App() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<AudioFileSelection | null>(null);
  const [model, setModel] = useState<"small" | "medium">("small");
  const [language, setLanguage] = useState<"vi" | "en" | "auto">("vi");
  const [format, setFormat] = useState<"txt" | "json" | "srt">("txt");
  const logicalCpuCount = Math.max(1, navigator.hardwareConcurrency || 4);
  const [cpuThreads, setCpuThreads] = useState(logicalCpuCount);
  const [text, setText] = useState("");
  const [outputFiles, setOutputFiles] = useState<string[]>([]);
  const [job, setJob] = useState<TranscriptionJobStatus | null>(null);
  const [logSnapshot, setLogSnapshot] = useState<LogSnapshot | null>(null);
  const [logsExpanded, setLogsExpanded] = useState(false);

  const refreshStatus = useCallback(async () => {
    setStatus(await window.localStudio.runtime.getStatus());
  }, []);
  const refreshLogs = useCallback(async () => {
    setLogSnapshot(await window.localStudio.diagnostics.getEvents());
  }, []);

  useEffect(() => {
    refreshStatus().catch((reason) => setError(friendlyError(reason)));
    refreshLogs().catch(() => undefined);
  }, [refreshLogs, refreshStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (busy) refreshStatus().catch(() => undefined);
      if (busy || logsExpanded) refreshLogs().catch(() => undefined);
    }, 750);
    return () => window.clearInterval(timer);
  }, [busy, logsExpanded, refreshLogs, refreshStatus]);

  useEffect(() => {
    if (!job || !["queued", "converting", "transcribing"].includes(job.state)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await window.localStudio.transcribe.getStatus(job.jobId);
        setJob(next);
        if (next.result) {
          setText(next.result.text);
          setOutputFiles(next.result.outputFiles);
        }
        if (next.error) setError(next.error);
      } catch (reason) {
        setError(friendlyError(reason));
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [job]);

  const requiredReady = useMemo(
    () =>
      ["ffmpeg", "whisper", "modelSmall"].every(
        (key) => status?.items[key]?.status === "ready"
      ),
    [status]
  );
  const mediumReady = status?.items.modelMedium?.status === "ready";
  const jobRunning = Boolean(
    job && ["queued", "converting", "transcribing"].includes(job.state)
  );

  async function runRuntimeAction(
    action: Exclude<BusyAction, null>,
    operation: () => Promise<RuntimeStatus>
  ) {
    setBusy(action);
    setError("");
    try {
      setStatus(await operation());
    } catch (reason) {
      setError(friendlyError(reason));
      await refreshStatus().catch(() => undefined);
      await refreshLogs().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function pickFile() {
    setError("");
    try {
      const picked = await window.localStudio.audio.pickFile();
      if (picked) {
        setSelection(picked);
        setText("");
        setOutputFiles([]);
        setJob(null);
      }
    } catch (reason) {
      setError(friendlyError(reason));
      await refreshLogs().catch(() => undefined);
    }
  }

  async function startOrResume() {
    if (!selection) return;
    setError("");
    try {
      if (job?.state === "paused") {
        setJob(await window.localStudio.transcribe.resume(job.jobId));
      } else {
        setText("");
        setOutputFiles([]);
        const next = await window.localStudio.transcribe.start({
          inputPath: selection.path,
          model,
          language,
          outputFormat: format,
          cpuThreads
        });
        setJob(next);
        if (next.result) {
          setText(next.result.text);
          setOutputFiles(next.result.outputFiles);
        }
        if (next.error) setError(next.error);
      }
    } catch (reason) {
      setError(friendlyError(reason));
      await refreshLogs().catch(() => undefined);
    }
  }

  async function pauseJob() {
    if (!job) return;
    try {
      setJob(await window.localStudio.transcribe.pause(job.jobId));
      await refreshLogs().catch(() => undefined);
    } catch (reason) {
      setError(friendlyError(reason));
    }
  }

  async function stopJob() {
    if (!job) return;
    try {
      setJob(await window.localStudio.transcribe.stop(job.jobId));
      await refreshLogs().catch(() => undefined);
    } catch (reason) {
      setError(friendlyError(reason));
    }
  }

  const runtimePanel = (
    <RuntimePanel
      status={status}
      busy={busy}
      workflowLocked={Boolean(job?.canStop)}
      ready={requiredReady}
      onInstall={() =>
        runRuntimeAction("install", () => window.localStudio.runtime.ensureRequired())
      }
      onRepair={() =>
        runRuntimeAction("repair", () => window.localStudio.runtime.repair())
      }
      onMedium={() =>
        runRuntimeAction("medium", () =>
          window.localStudio.runtime.installItem("model-medium")
        )
      }
    />
  );

  const workspace = (
    <TranscriptionWorkspace
      requiredReady={requiredReady}
      mediumReady={mediumReady}
      busy={busy !== null}
      selection={selection}
      model={model}
      language={language}
      format={format}
      cpuThreads={cpuThreads}
      logicalCpuCount={logicalCpuCount}
      job={job}
      jobRunning={jobRunning}
      text={text}
      outputFiles={outputFiles}
      onPickFile={pickFile}
      onModelChange={setModel}
      onLanguageChange={setLanguage}
      onFormatChange={setFormat}
      onCpuChange={setCpuThreads}
      onStart={startOrResume}
      onPause={pauseJob}
      onStop={stopJob}
    />
  );

  return (
    <main className="app-shell">
      <AppHeader
        ready={requiredReady}
        mascotState={mascotState(requiredReady, job, Boolean(error))}
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="workflow-stack">
        {requiredReady ? (
          <>
            {workspace}
            {runtimePanel}
          </>
        ) : (
          <>
            {runtimePanel}
            {workspace}
          </>
        )}
      </div>
      <DiagnosticsPanel
        snapshot={logSnapshot}
        expanded={logsExpanded}
        onToggle={() => {
          setLogsExpanded((expanded) => !expanded);
          refreshLogs().catch(() => undefined);
        }}
      />
    </main>
  );
}
