import { describe, expect, it } from "vitest";
import { buildLiveUrl, parseLiveEvent, safeLiveError, WebSocketRemoteLiveClient } from "./liveClient";

describe("remote live client", () => {
  it("builds the selected WebSocket route without credential query parameters", () => {
    const url = buildLiveUrl("https://asr.example.test/base", "mtg one");
    expect(url).toBe("wss://asr.example.test/base/live/sessions/mtg%20one/stream");
    expect(url).not.toContain("apiKey");
  });

  it("ignores malformed events and maps errors to safe messages", () => {
    expect(parseLiveEvent({ type: "partial", text: "missing fields" })).toBeNull();
    expect(parseLiveEvent({ type: "unknown" })).toBeNull();
    expect(safeLiveError("UNAUTHORIZED")).toBe("The remote server rejected the saved API key.");
    expect(safeLiveError("SECRET_FROM_SERVER")).toBe("The remote live session failed.");
  });

  it("sends a close control and closes the connection", async () => {
    const sent: unknown[] = [];
    let closed = false;
    const listeners = new Map<string, ((event?: unknown) => void)[]>();
    const socket = {
      readyState: WebSocket.OPEN,
      send: (value: unknown) => { sent.push(value); },
      close: () => { closed = true; listeners.get("close")?.forEach((fn) => fn()); },
      addEventListener: (name: string, listener: (event?: unknown) => void) => {
        listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      }
    };
    const client = new WebSocketRemoteLiveClient(() => socket as never);
    (client as unknown as { socket: typeof socket }).socket = socket;
    const closing = client.close();
    listeners.get("message")?.forEach((fn) => fn({ data: '{"type":"session_closed"}' }));
    await closing;
    expect(sent).toContain('{"type":"close"}');
    expect(closed).toBe(true);
  });
});
