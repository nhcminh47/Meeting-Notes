# 0002: Ephemeral Server Processing

## Status

Proposed

## Context

The remote server exists to provide GPU-accelerated automatic speech recognition while preserving the application's local-first data model.

## Decision

The remote server will act only as an ephemeral GPU ASR processor. It will delete temporary audio, transcript, and job files after processing or when their configured time-to-live expires.

## Consequences

- The server cannot be treated as durable meeting storage.
- Processing workflows must tolerate temporary artifacts being removed.
- Cleanup behavior and retention limits must be testable and operationally visible.

## Notes / Future updates

Future work should define concrete cleanup timing, failure recovery, and observability while preserving ephemeral processing.
