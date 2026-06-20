import { useEffect, useState } from "react";
import type { RemoteConnectionStatus } from "../../../../shared/apiTypes";
import { Button } from "../atoms/Button";

type BusyAction = "save" | "test" | "clear-key" | "clear-all" | null;

export function RemoteServerSettings() {
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [status, setStatus] = useState<RemoteConnectionStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    window.localStudio.remoteSettings
      .get()
      .then((settings) => {
        if (!active) return;
        setServerUrl(settings.serverUrl ?? "");
        setHasApiKey(settings.hasApiKey);
      })
      .catch(() => {
        if (active) setError("Remote settings could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(action: BusyAction, operation: () => Promise<void>) {
    setBusy(action);
    setError("");
    try {
      await operation();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message.replace(/^Error invoking remote method '[^']+': Error: /, ""));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="remote-settings" aria-labelledby="remote-settings-title">
      <div className="remote-settings__heading">
        <div>
          <p className="eyebrow">Optional GPU processing</p>
          <h2 id="remote-settings-title">Remote Server</h2>
        </div>
        <span className={`remote-settings__status remote-settings__status--${status?.status ?? "idle"}`}>
          {status?.message ?? (hasApiKey ? "Configured" : "Not configured")}
        </span>
      </div>
      <div className="remote-settings__fields">
        <label htmlFor="remote-server-url">
          <span>Server URL</span>
          <input
            id="remote-server-url"
            aria-label="Server URL"
            type="url"
            value={serverUrl}
            placeholder="https://asr.example.com"
            autoComplete="url"
            onChange={(event) => {
              setServerUrl(event.target.value);
              setStatus(null);
            }}
          />
        </label>
        <label htmlFor="remote-api-key">
          <span>API Key</span>
          <input
            id="remote-api-key"
            aria-label="API Key"
            type="password"
            value={apiKey}
            placeholder={hasApiKey ? "********" : "Enter API key"}
            autoComplete="new-password"
            onChange={(event) => {
              setApiKey(event.target.value);
              setStatus(null);
            }}
          />
          <small>{hasApiKey && !apiKey ? "API key saved securely" : "The key is never shown after saving."}</small>
        </label>
      </div>
      {error && <p className="remote-settings__error" role="alert">{error}</p>}
      <div className="remote-settings__actions">
        <Button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("test", async () => {
            setStatus(await window.localStudio.remoteSettings.testConnection({ serverUrl, apiKey: apiKey || undefined }));
          })}
        >
          {busy === "test" ? "Testing…" : "Test Connection"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void run("save", async () => {
            const next = await window.localStudio.remoteSettings.save({ serverUrl, apiKey: apiKey || undefined });
            setServerUrl(next.serverUrl ?? "");
            setHasApiKey(next.hasApiKey);
            setApiKey("");
            setStatus({ ok: true, status: "connected", message: "Settings saved." });
          })}
        >
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy !== null || !hasApiKey}
          onClick={() => void run("clear-key", async () => {
            const next = await window.localStudio.remoteSettings.clearApiKey();
            setHasApiKey(next.hasApiKey);
            setApiKey("");
            setStatus(null);
          })}
        >
          Clear API Key
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={busy !== null || (!serverUrl && !hasApiKey)}
          onClick={() => void run("clear-all", async () => {
            await window.localStudio.remoteSettings.clearAll();
            setServerUrl("");
            setApiKey("");
            setHasApiKey(false);
            setStatus(null);
          })}
        >
          Clear All
        </Button>
      </div>
    </section>
  );
}
