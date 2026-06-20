# 0004: Live Transport Decision

## Status

Accepted

## Context

English live meeting transcription is the v1 priority and needs a transport between the Electron application and the remote ASR server. WebRTC and WebSocket PCM have different complexity, latency, reliability, and operational tradeoffs.

## Options considered

### WebRTC audio track with DataChannel events

WebRTC provides media-oriented congestion control, jitter handling, and a natural split between an
audio track and event messages. A server prototype would add a WebRTC implementation such as
`aiortc`, codec negotiation, ICE signaling, and STUN/TURN deployment. Cloudflare Tunnel does not
proxy arbitrary UDP media, so a tunneled signaling endpoint alone would not guarantee a media path;
a separately reachable TURN service would commonly be needed for restricted networks.

### WebSocket PCM streaming

WebSocket PCM uses one ordered, reliable connection for binary audio chunks and JSON lifecycle
events. It fits FastAPI directly, is straightforward to exercise with deterministic tests, and
travels through the same HTTPS origin and Cloudflare Tunnel as the gateway API. It lacks WebRTC's
media congestion and jitter features, so the client and server must define chunk pacing, buffering,
backpressure, and reconnect behavior.

## Findings

The WebSocket proof of concept authenticates with the first JSON message, receives binary chunks,
reports cumulative byte and chunk counts, and closes cleanly. It keeps only counters and the current
message in memory and writes no audio or transcript data. This validates the gateway integration and
security shape without new server dependencies.

A meaningful WebRTC proof would require significantly more deployment work than the transport
handler itself. ICE/TURN and UDP reachability remain operational risks when the HTTP API is exposed
through Cloudflare Tunnel. Those costs are not justified before the English live ASR pipeline has
established its latency and network requirements.

## Decision

Use authenticated WebSocket PCM streaming for v1. Defer WebRTC until after the English live path is
stable and measurements show that its media-specific behavior would justify the extra dependencies
and deployment surface.

## Consequences

- The v1 client sends PCM audio as paced binary WebSocket messages and receives JSON events on the
  same connection.
- Live WebSockets require authentication and must not accept credentials in URL query strings.
- The spike uses first-message API-key authentication. Production work should consider exchanging
  the normal bearer-authenticated HTTP request for a short-lived, single-use stream token.
- The implementation must add explicit format negotiation, size/rate limits, backpressure,
  heartbeats, reconnect semantics, and session concurrency controls before production use.
- WebRTC remains available as a future optimization rather than a v1 prerequisite.

## Notes / Future updates

Issue #19 should build English live ASR on this transport without making the server a durable data
owner. It should define the PCM format and replace or harden the spike authentication flow before
shipping production live transcription.
