import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AudioFileSelection,
  LogEvent,
  LogSnapshot,
  TranscriptionJobStatus
} from "../../shared/apiTypes";
import type { RuntimeStatus } from "../../main/runtime/runtimeTypes";

type BusyAction = "install" | "repair" | "medium" | null;

const ITEM_LABELS: Record<string, string> = {
  ffmpeg: "FFmpeg",
  whisper: "whisper.cpp",
  modelSmall: "Small model",
  modelMedium: "Medium model"
};

const ITEM_SIZES: Record<string, string> = {
  ffmpeg: "211 MB",
  whisper: "4 MB",
  modelSmall: "465 MB",
  modelMedium: "1.43 GB"
};

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

function RuntimePanel(props: {
  status: RuntimeStatus | null;
  busy: BusyAction;
  workflowLocked: boolean;
  onInstall: () => void;
  onRepair: () => void;
  onMedium: () => void;
}) {
  return (
    <section className="panel runtime-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Local dependencies</p>
          <h2>Runtime setup</h2>
        </div>
        <span className="version">Manifest {props.status?.runtimeVersion ?? "..."}</span>
      </div>

      <div className="runtime-grid">
        {Object.entries(ITEM_LABELS).map(([key, label]) => {
          const item = props.status?.items[key];
          const status = item?.status ?? "missing";
          return (
            <div className="runtime-item" key={key}>
              <div>
                <strong>{label}</strong>
                <small>{ITEM_SIZES[key]} download</small>
              </div>
              <div className="status-wrap">
                <span className={`status status-${status}`}>{status}</span>
                {typeof item?.progress === "number" &&
                  ["downloading", "extracting"].includes(status) && (
                    <div className="progress" aria-label={`${label} progress`}>
                      <span style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
              </div>
              {item?.error && <p className="inline-error">{item.error}</p>}
            </div>
          );
        })}
      </div>

      <div className="actions">
        <button
          onClick={props.onInstall}
          disabled={props.busy !== null || props.workflowLocked}
        >
          {props.busy === "install" ? "Installing..." : "Install Runtime"}
        </button>
        <button
          className="secondary"
          onClick={props.onRepair}
          disabled={props.busy !== null || props.workflowLocked}
        >
          {props.busy === "repair" ? "Repairing..." : "Repair Runtime"}
        </button>
        <button
          className="secondary"
          onClick={props.onMedium}
          disabled={props.busy !== null || props.workflowLocked}
        >
          {props.busy === "medium" ? "Installing..." : "Install Medium Model"}
        </button>
      </div>
      <p className="note">
        Required download is about 680 MB. The optional medium model adds about 1.43 GB.
      </p>
    </section>
  );
}

function EventLogPanel(props: {
  snapshot: LogSnapshot | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const events = props.snapshot?.events ?? [];
  const errorCount = events.filter((event) => event.level === "error").length;
  const latestEvents = [...events].reverse();

  function renderDetails(event: LogEvent) {
    if (!event.details) return null;
    return (
      <dl>
        {Object.entries(event.details).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <section className="panel diagnostics-panel">
      <button
        className="diagnostics-toggle"
        onClick={props.onToggle}
        aria-expanded={props.expanded}
      >
        <span>
          <span className="toggle-mark">{props.expanded ? "−" : "+"}</span>
          Event log
        </span>
        <span className="log-summary">
          {events.length} events
          {errorCount > 0 && <strong>{errorCount} errors</strong>}
        </span>
      </button>

      {props.expanded && (
        <div className="diagnostics-body">
          <p className="log-path">
            Persistent log: <code>{props.snapshot?.logFilePath ?? "Loading..."}</code>
          </p>
          <div className="event-list" role="log" aria-label="Application event log">
            {latestEvents.length === 0 && <p className="empty-log">No events recorded yet.</p>}
            {latestEvents.map((event) => (
              <article className={`log-event log-${event.level}`} key={event.id}>
                <div className="log-event-heading">
                  <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                  <span className="log-level">{event.level}</span>
                  <span className="log-source">{event.source}</span>
                </div>
                <p>{event.message}</p>
                {renderDetails(event)}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
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
        setJob(
          await window.localStudio.transcribe.start({
            inputPath: selection.path,
            model,
            language,
            outputFormat: format,
            cpuThreads
          })
        );
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

  const jobRunning = Boolean(
    job && ["queued", "converting", "transcribing"].includes(job.state)
  );
  const controlsLocked = !requiredReady || busy !== null || jobRunning;

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Private, on-device transcription</p>
          <h1>Local Whisper Studio</h1>
          <p>Convert and transcribe audio locally. Files never leave this computer.</p>
        </div>
        <div className={`readiness ${requiredReady ? "ready" : ""}`}>
          <span />
          {requiredReady ? "Runtime ready" : "Setup required"}
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <RuntimePanel
        status={status}
        busy={busy}
        workflowLocked={Boolean(job?.canStop)}
        onInstall={() =>
          runRuntimeAction("install", () => window.localStudio.runtime.ensureRequired())
        }
        onRepair={() => runRuntimeAction("repair", () => window.localStudio.runtime.repair())}
        onMedium={() =>
          runRuntimeAction("medium", () =>
            window.localStudio.runtime.installItem("model-medium")
          )
        }
      />

      <section className={`panel transcription-panel ${!requiredReady ? "disabled" : ""}`}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Audio workflow</p>
            <h2>Transcribe a file</h2>
          </div>
        </div>

        {!requiredReady && (
          <div className="blocked-message">Install the required runtime to enable transcription.</div>
        )}

        <div className="file-picker">
          <button
            className="secondary"
            onClick={pickFile}
            disabled={!requiredReady || busy !== null || Boolean(job?.canStop)}
          >
            Choose audio file
          </button>
          <span>{selection?.name ?? "No file selected"}</span>
        </div>

        <div className="controls">
          <label>
            Model
            <select
              value={model}
              onChange={(event) => setModel(event.target.value as "small" | "medium")}
              disabled={controlsLocked || job?.state === "paused"}
            >
              <option value="small">Small</option>
              <option value="medium" disabled={!mediumReady}>
                Medium {!mediumReady ? "(not installed)" : ""}
              </option>
            </select>
          </label>
          <label>
            Language
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as "vi" | "en" | "auto")}
              disabled={controlsLocked || job?.state === "paused"}
            >
              <option value="vi">Vietnamese</option>
              <option value="en">English</option>
              <option value="auto">Auto detect</option>
            </select>
          </label>
          <label>
            Output
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as "txt" | "json" | "srt")}
              disabled={controlsLocked || job?.state === "paused"}
            >
              <option value="txt">Text</option>
              <option value="json">JSON</option>
              <option value="srt">Subtitles</option>
            </select>
          </label>
          <label>
            CPU usage
            <select
              value={cpuThreads}
              onChange={(event) => setCpuThreads(Number(event.target.value))}
              disabled={controlsLocked || job?.state === "paused"}
            >
              <option value={Math.max(1, Math.ceil(logicalCpuCount * 0.5))}>
                Balanced ({Math.max(1, Math.ceil(logicalCpuCount * 0.5))} threads)
              </option>
              <option value={Math.max(1, Math.ceil(logicalCpuCount * 0.75))}>
                High ({Math.max(1, Math.ceil(logicalCpuCount * 0.75))} threads)
              </option>
              <option value={logicalCpuCount}>Maximum ({logicalCpuCount} threads)</option>
            </select>
          </label>
        </div>

        <div className="job-progress" aria-label="Transcription progress">
          <div className="job-progress-heading">
            <span>{job?.phase ?? "Ready to start"}</span>
            <strong>{job?.progress ?? 0}%</strong>
          </div>
          <div className={`job-progress-track ${jobRunning ? "active" : ""}`}>
            <span style={{ width: `${job?.progress ?? 0}%` }} />
          </div>
          <span className={`job-state job-state-${job?.state ?? "idle"}`}>
            {job?.state ?? "idle"}
          </span>
        </div>

        <div className="job-controls">
          <button
            onClick={startOrResume}
            disabled={
              !requiredReady ||
              !selection ||
              busy !== null ||
              jobRunning ||
              (job !== null && !["paused", "completed", "stopped", "error"].includes(job.state))
            }
          >
            Start
          </button>
          <button
            className="secondary"
            onClick={pauseJob}
            disabled={!job?.canPause || busy !== null}
          >
            Pause
          </button>
          <button
            className="danger"
            onClick={stopJob}
            disabled={!job?.canStop || busy !== null}
          >
            Stop
          </button>
        </div>

        {(text || outputFiles.length > 0) && (
          <div className="result">
            <h3>Result</h3>
            <pre>{text || "The transcript file was generated."}</pre>
            {outputFiles.map((file) => (
              <code key={file}>{file}</code>
            ))}
          </div>
        )}
      </section>

      <EventLogPanel
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
