# Live Transport Spike

Issue #18 evaluates transport for realtime audio between Electron and the ASR Gateway. This is a
transport probe only: it does not capture a microphone, run ASR, or emit transcript text.

## Options tested

| Concern | WebRTC audio + DataChannel | WebSocket PCM |
| --- | --- | --- |
| FastAPI integration | Requires WebRTC, SDP, ICE, and codec dependencies | Native WebSocket support |
| Network behavior | Media-oriented congestion and jitter handling | Ordered reliable stream; application owns pacing and backpressure |
| Cloudflare Tunnel | Signaling can use HTTP, but media commonly needs UDP reachability and TURN | Uses the existing HTTPS tunnel and WebSocket upgrade |
| Testing and debugging | More moving parts and network-dependent setup | Deterministic local TestClient coverage |
| Client event channel | DataChannel | JSON messages on the same socket |
| Operational risk for v1 | Higher | Lower |

WebRTC was evaluated at the architecture and deployment level rather than forced into the Python
gateway. A useful prototype would need `aiortc` or equivalent, SDP signaling, ICE configuration,
codec handling, and likely a separately operated TURN endpoint because Cloudflare Tunnel does not
provide a general UDP media path. That experiment would not retire the main deployment risk within
this issue's scope.

## Prototype result

The selected proof of concept is:

```text
WS /live/sessions/{sessionId}/stream
```

The server accepts the WebSocket, requires the first client message to be an auth object, and then
handles binary messages as fake PCM chunks. It records only connection-local counters. No chunks,
credentials, or events are written to disk or application logs.

Authentication for the spike is:

```json
{"type":"auth","apiKey":"<user-provided-api-key>"}
```

The API key is deliberately not accepted in the URL query string. Missing, malformed, or invalid
first-message auth receives a safe `UNAUTHORIZED` event and policy-violation close code 1008.
First-message API-key auth is dev/spike-only; a production refinement should prefer a short-lived,
single-use stream token issued by an HTTP endpoint protected with the normal bearer header.

## Event shape

Successful authentication starts the session:

```json
{"type":"session_started","sessionId":"live_probe_001"}
```

Each binary message produces a cumulative probe event:

```json
{
  "type": "transport_probe",
  "sessionId": "live_probe_001",
  "receivedChunks": 3,
  "receivedBytes": 9600,
  "message": "Audio chunk received"
}
```

The client closes cleanly with `{"type":"close"}` and receives `session_closed` with final
counters. Invalid post-auth text messages receive a safe `INVALID_MESSAGE` event. No event contains
audio or transcript text.

## Cloudflare Tunnel considerations

WebSocket upgrades operate over the gateway's HTTPS origin, avoiding a separate public media port.
Deployments must still configure suitable tunnel and origin timeouts, use `wss://`, and test long
connections, reconnect behavior, and backpressure under realistic network loss. Automated tests do
not require a tunnel.

## Decision and limitations

WebSocket PCM is selected for v1 because it has the smallest dependency and deployment surface,
fits the current FastAPI gateway, crosses Cloudflare Tunnel cleanly, and is easy to test and debug.
WebRTC can be revisited after the live English pipeline exposes measured shortcomings.

Issue #19 builds on the selected transport with bounded in-memory PCM buffering, English ASR,
speaker-turn events, concurrency limits, and session TTL cleanup. V1 still has no format
negotiation, heartbeat, resume protocol, short-lived stream-token exchange, production Electron UI,
or diarization. It cannot recover a disconnected session.

## Issue #19 pipeline

Clients send paced 16 kHz mono signed 16-bit little-endian PCM binary chunks. The server keeps only
the configured recent window in memory and feeds each chunk to the configured backend. The optional
`faster-whisper` backend forces English transcription and enables its VAD filter. The explicit fake
backend is deterministic and exists only for CI and transport development. Any audio remains
ephemeral; finalized speaker-turn dialogue remains owned and persisted by the desktop application.
