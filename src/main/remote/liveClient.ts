import type { LiveConnectionEvent } from "../../shared/apiTypes";

type SocketLike = Pick<WebSocket, "readyState" | "send" | "close" | "addEventListener">;
type SocketFactory = (url: string) => SocketLike;

export function buildLiveUrl(serverUrl: string, sessionId: string): string {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/live/sessions/${encodeURIComponent(sessionId)}/stream`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function parseLiveEvent(value: unknown): LiveConnectionEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (event.type === "session_started" || event.type === "session_closed") {
    return typeof event.sessionId === "string" ? event as LiveConnectionEvent : null;
  }
  if (event.type === "error") {
    return typeof event.code === "string" && typeof event.message === "string"
      ? { type: "error", code: event.code, message: event.message }
      : null;
  }
  if (event.type !== "partial" && event.type !== "turn_final") return null;
  const final = event.type === "turn_final";
  if (
    typeof event.sessionId !== "string" || typeof event.turnId !== "string" ||
    typeof event.speaker !== "string" || typeof event.start !== "number" ||
    typeof event.end !== "number" || typeof event.text !== "string" ||
    event.source !== "live" || event.isFinal !== final
  ) return null;
  return event as LiveConnectionEvent;
}

export class WebSocketRemoteLiveClient {
  private socket: SocketLike | null = null;
  private closing = false;
  private started = false;
  private listener: (event: LiveConnectionEvent) => void = () => undefined;
  constructor(private readonly socketFactory: SocketFactory = (url) => new WebSocket(url)) {}

  onEvent(callback: (event: LiveConnectionEvent) => void): void { this.listener = callback; }

  async connect(options: { serverUrl: string; apiKey: string; sessionId: string }): Promise<void> {
    this.closing = false;
    this.started = false;
    const socket = this.socketFactory(buildLiveUrl(options.serverUrl, options.sessionId));
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("The remote server timed out.")), 10_000);
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "auth", apiKey: options.apiKey, language: "en" }));
      });
      socket.addEventListener("message", (message: MessageEvent) => {
        try {
          const parsed = parseLiveEvent(JSON.parse(String(message.data)));
          if (!parsed) return;
          this.listener(parsed);
          if (parsed.type === "session_started") { this.started = true; clearTimeout(timeout); resolve(); }
          if (parsed.type === "error") { clearTimeout(timeout); reject(new Error(safeLiveError(parsed.code))); }
        } catch { /* Malformed server events are intentionally ignored. */ }
      });
      socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Could not connect to the remote server.")); });
      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        if (!this.closing) {
          const error = { type: "error", code: "CONNECTION_CLOSED", message: "The remote connection closed." } as const;
          this.listener(error);
          if (!this.started) reject(new Error(safeLiveError(error.code)));
        }
      });
    });
  }

  async sendAudioChunk(chunk: ArrayBuffer | Uint8Array): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("The live connection is not open.");
    this.socket.send(chunk);
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.closing = true;
    this.socket = null;
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        if (socket.readyState !== WebSocket.CLOSED) socket.close(1000);
        resolve();
      };
      socket.addEventListener("close", finish);
      socket.addEventListener("message", (message: MessageEvent) => {
        try { if (JSON.parse(String(message.data)).type === "session_closed") finish(); }
        catch { /* Ignore malformed close acknowledgements. */ }
      });
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "close" }));
      else finish();
      setTimeout(finish, 1_000);
    });
  }
}

export function safeLiveError(code: string): string {
  if (code === "UNAUTHORIZED") return "The remote server rejected the saved API key.";
  if (code === "LIVE_SESSION_LIMIT") return "The remote server has no live-session capacity.";
  if (code === "ASR_UNAVAILABLE") return "Live transcription is unavailable on the remote server.";
  return "The remote live session failed.";
}
