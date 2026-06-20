import path from "node:path";
import { app } from "electron";
import type { LiveConnectionEvent, LiveMeetingEvent, LiveMeetingStatus } from "../../shared/apiTypes";
import { remoteCredentialStore, type RemoteCredentialStore } from "./credentials";
import { safeLiveError, WebSocketRemoteLiveClient } from "./liveClient";
import { appendFinalTurn } from "../meetings/liveTranscriptWriter";
import { createLiveMeeting, updateMeeting, type LocalMeeting } from "../meetings/meetingStore";

export class RemoteLiveSession {
  private status: LiveMeetingStatus = { state: "stopped", meetingId: null, message: "Ready." };
  private meeting: LocalMeeting | null = null;
  private client: WebSocketRemoteLiveClient | null = null;
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly emit: (event: LiveMeetingEvent) => void,
    private readonly credentials: RemoteCredentialStore = remoteCredentialStore,
    private readonly meetingsRoot = () => path.join(app.getPath("userData"), "meetings"),
    private readonly clientFactory = () => new WebSocketRemoteLiveClient()
  ) {}

  getStatus(): LiveMeetingStatus { return { ...this.status }; }
  private setStatus(state: LiveMeetingStatus["state"], message: string): void {
    this.status = { state, meetingId: this.meeting?.metadata.id ?? null, message };
    this.emit({ type: "status", status: this.getStatus() });
  }

  async start(): Promise<LiveMeetingStatus> {
    if (this.client) throw new Error("A remote live meeting is already active.");
    const [serverUrl, apiKey] = await Promise.all([this.credentials.getServerUrl(), this.credentials.getApiKey()]);
    if (!serverUrl || !apiKey) {
      this.setStatus("not_configured", "Save a remote server URL and API key first.");
      return this.getStatus();
    }
    this.setStatus("connecting", "Connecting to remote English live ASR…");
    try {
      this.meeting = await createLiveMeeting(this.meetingsRoot());
    } catch {
      this.setStatus("error", "The local meeting files could not be created.");
      return this.getStatus();
    }
    const client = this.clientFactory();
    this.client = client;
    client.onEvent((event) => { void this.handleEvent(event); });
    try {
      await client.connect({ serverUrl, apiKey, sessionId: this.meeting.metadata.id });
      this.setStatus("recording", "Development PCM source is streaming.");
    } catch (error) {
      await updateMeeting(this.meeting, { status: "failed", endedAt: new Date().toISOString() });
      this.client = null;
      this.setStatus("error", error instanceof Error ? error.message : "Could not start the live meeting.");
    }
    return this.getStatus();
  }

  private async handleEvent(event: LiveConnectionEvent): Promise<void> {
    if (!this.meeting) return;
    if (event.type === "session_started") {
      await updateMeeting(this.meeting, { serverSessionId: event.sessionId });
      this.setStatus("connected", "Connected to remote English live ASR.");
    }
    if (event.type === "error") this.setStatus("error", safeLiveError(event.code));
    if (event.type === "session_closed" && this.status.state !== "stopping") {
      await updateMeeting(this.meeting, { status: "completed", endedAt: new Date().toISOString() });
      this.client = null;
      this.setStatus("stopped", "The remote server closed the live session.");
    }
    if (event.type === "turn_final") {
      const meeting = this.meeting;
      this.persistenceQueue = this.persistenceQueue.then(async () => {
        await appendFinalTurn(meeting.folder, meeting.metadata.id, event);
      });
      try { await this.persistenceQueue; }
      catch { this.setStatus("error", "A finalized turn could not be saved locally."); return; }
    }
    this.emit({ type: "connection", event });
  }

  async sendAudio(chunk: Uint8Array): Promise<void> {
    if (!this.client) throw new Error("No remote live meeting is active.");
    await this.client.sendAudioChunk(chunk);
  }

  async stop(): Promise<LiveMeetingStatus> {
    if (!this.client || !this.meeting) return this.getStatus();
    this.setStatus("stopping", "Stopping live meeting…");
    const client = this.client;
    this.client = null;
    await client.close().catch(() => undefined);
    await this.persistenceQueue.catch(() => undefined);
    await updateMeeting(this.meeting, { status: "completed", endedAt: new Date().toISOString() });
    this.setStatus("stopped", "Live meeting stopped; finalized turns remain local.");
    return this.getStatus();
  }
}
