# 0005: Speaker-Turn Transcript as Source of Truth

## Status

Proposed

## Context

Meeting transcripts can be represented as dialogue, summaries, or bullet notes. Downstream features need one authoritative transcript representation that preserves who said what and in what order.

## Decision

Speaker-turn dialogue will be the source of truth for transcripts. Bullet notes and other summaries will be derived views rather than authoritative transcript data.

## Consequences

- Transcript storage and APIs must preserve ordered speaker turns.
- Notes and summaries must be traceable to the underlying dialogue.
- Editing and export features should avoid replacing source dialogue with derived content.

## Notes / Future updates

Future work should define speaker identity, turn boundaries, corrections, and batch transcript formats. Vietnamese transcript support remains a later batch-only concern; Vietnamese realtime is out of scope.
