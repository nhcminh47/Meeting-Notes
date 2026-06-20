# Desktop Integration Notes

## Remote English Live Meeting

The desktop main process owns the remote live session. It reads the saved server URL and API key,
creates a local meeting, converts the configured HTTP(S) base URL to the matching WS(S) endpoint,
and sends the API key only in the first WebSocket `auth` message. The renderer receives status and
transcript events through a narrow preload API; it never receives credentials or filesystem paths.

`partial` events are held in renderer memory and shown separately. Valid `turn_final` events are
serialized by the main process and newline-appended to the meeting's `live-transcript.jsonl`.
Malformed and unknown events are ignored. Stop sends the protocol `close` control, briefly waits
for `session_closed`, closes the socket, drains pending local writes, and marks metadata complete.

The current panel uses an explicitly labeled development-only source that sends silent, paced
16 kHz mono signed 16-bit PCM through the real transport. This verifies auth, transport, event,
IPC, and persistence without a GPU in tests. Browser microphone capture into this exact PCM format
and retained `recording.wav` creation remain pending; this mode must not be presented as microphone
recording until those pieces are connected.

The Electron main process will eventually coordinate recording, optional remote processing, and
local persistence. The renderer should request operations through a narrow IPC boundary rather
than receiving unrestricted filesystem access.

## Remote processing boundary

Remote ASR is an ephemeral processor. The desktop may send audio with a temporary session or job
ID, receive ordered speaker turns, validate and normalize them, and then persist them under the
local meeting ID. A remote response must not choose the durable meeting folder or become the only
copy of a transcript.

`serverSessionId` and any future remote job ID are retry/correlation metadata only. They may expire,
change between attempts, or be removed after processing. Local meeting, speaker, and turn IDs
remain stable independently of server lifecycle.

## Transcript flow

1. Create local metadata and speaker files before recording.
2. Append each finalized live turn to `live-transcript.jsonl`; keep interim hypotheses outside the
   durable model.
3. Preserve the recording and live log if processing fails so the desktop can retry or recover.
4. Normalize a successful final result into ordered `TranscriptTurn` objects, retaining stable
   speaker IDs and optional display names.
5. Atomically commit `final-transcript.json`, then mark the local meeting finalized.
6. Render dialogue, notes, summaries, and exports from canonical turns. Derived files never replace
   those turns.

Speaker renames use narrow main-process IPC operations to read metadata, save a trimmed display
name, or clear it to `null`. The main process validates the existing meeting folder, stable speaker
ID, and name before atomically replacing `speakers.json`; the renderer receives no filesystem
access. Rename never calls the server and never rewrites `live-transcript.jsonl` or
`final-transcript.json`.

Renderers resolve current display text from `speakers.json` name, speaker label, the turn's nullable
`speakerName` snapshot, stable `speakerId`/`speaker`, then `UNKNOWN`. The server does not identify
real people. Diarization, summary generation, export UI, and language-mode behavior are
intentionally deferred to later issues.

## Remote credentials

Remote credentials are user-provided through the desktop settings layer; no server URL or API key
is hardcoded. Protected calls use `Authorization: Bearer <apiKey>`. The preload boundary exposes
safe settings operations and key-presence state, never the raw saved key or credential storage.

Future live and final ASR features must obtain their remote configuration through this settings
layer. They must not duplicate credential handling or place the key in URLs, logs, renderer state,
or durable meeting records.

## Live transport spike

The v1 transport decision is WebSocket PCM. The issue #18 probe is dev-only and is not wired into
the recording UI. A future main-process client should derive `wss://.../live/sessions/{sessionId}/stream`
from the saved server URL, send the API key only in the first auth message, clear any temporary key
reference after authentication, and stream paced binary PCM chunks. It must never put the key in a
query string or expose it through preload.

For a manual fake-chunk probe, the intended browser-compatible sequence is:

```js
const socket = new WebSocket("wss://example.invalid/live/sessions/live_probe_001/stream")
socket.addEventListener("open", () => {
  socket.send(JSON.stringify({ type: "auth", apiKey: "<user-provided-api-key>" }))
})
socket.addEventListener("message", ({ data }) => console.log(JSON.parse(data)))
// Send only after receiving session_started:
socket.send(new Uint8Array([0, 0, 1, 0]).buffer)
socket.send(JSON.stringify({ type: "close" }))
```

Production integration should replace the direct API-key message with a short-lived stream token
if issue #19 adds the proposed token exchange. PCM format, pacing, limits, heartbeats, reconnects,
and backpressure are deliberately deferred.
