# 0001: Local-First Storage

## Status

Proposed

## Context

Local Whisper Studio is a local-first meeting assistant. Durable meeting data needs a clearly defined owner so privacy, availability, and lifecycle behavior remain predictable.

## Decision

The Electron desktop application will own all durable meeting data. Remote processing services will not be a durable system of record.

## Consequences

- Meeting history and durable artifacts remain under desktop application control.
- Remote processing must not become a dependency for long-term data access.
- Desktop storage, migration, backup, and deletion behavior require explicit design.

## Notes / Future updates

Future issues should refine the desktop storage schema and lifecycle without changing the local-first ownership model unless this ADR is superseded.
