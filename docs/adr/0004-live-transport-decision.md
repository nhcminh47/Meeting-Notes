# 0004: Live Transport Decision

## Status

Proposed

## Context

English live meeting transcription is the v1 priority and needs a transport between the Electron application and the remote ASR server. WebRTC and WebSocket PCM have different complexity, latency, reliability, and operational tradeoffs.

## Decision

The final live transport has not yet been selected. Issue #18 will complete this decision after the WebRTC vs WebSocket PCM spike.

## Consequences

- Implementations must not assume a final transport before the spike is evaluated.
- The spike should produce enough evidence to compare latency, reliability, complexity, and deployment constraints.
- Live transport-dependent work may need to wait for or explicitly account for the outcome of issue #18.

## Notes / Future updates

Issue #18 should update this ADR with the selected transport, rationale, and resulting implementation constraints.
