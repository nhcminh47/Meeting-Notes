# Meeting Storage

## Remote live creation and recovery

Starting Remote English Live Meeting creates `<userData>/meetings/<meeting-id>/` with
`metadata.json`, `speakers.json`, and an empty `live-transcript.jsonl`. Speaker metadata starts with
`SPEAKER_01` and `UNKNOWN`; no names or diarization are inferred. Meeting paths are relative and no
API key, authorization payload, server temporary path, or audio content is written to metadata.

Only validated `turn_final` events are appended, one newline-terminated JSON object per line.
Partial events are UI-only. Writes are serialized to preserve event order and never rewrite prior
lines. The development PCM source does not currently create `recording.wav`; local recording is a
known follow-up. Final transcript, notes, and exports remain outside this integration.

This document translates the [meeting data model](../../docs/data-model.md) into desktop storage
rules. It is a contract for future Electron implementation, not production storage code.

## Root and folder lifecycle

Electron resolves the OS-specific application data root and stores meetings beneath
`<userData>/meetings/<meeting-id>/`. Code must not assume that the root is literally `AppData`.
Within a meeting folder, filenames and meanings remain platform-independent.

The desktop client creates the meeting folder and initial `metadata.json` before recording. It owns
retention, backup, migration, and deletion. Remote paths must never be written as durable local
artifact paths.

## Write and recovery rules

- Store paths in metadata relative to the meeting folder and reject paths that escape it.
- Append finalized live turns to `live-transcript.jsonl` as one newline-terminated JSON object per
  line. Never update an earlier line in place.
- Flush appended live events often enough that an application crash loses at most the active,
  unfinalized hypothesis.
- On recovery, read complete JSONL lines in order and ignore an incomplete trailing line. Deduplicate
  replayed events by `(meetingId, turnId)`.
- Write replaceable JSON snapshots (`metadata.json`, `speakers.json`, and
  `final-transcript.json`) to temporary sibling files, then atomically rename them into place.
- Set `metadata.finalized` only after the final transcript snapshot is durable. A missing or invalid
  final snapshot means the meeting is not finalized, regardless of stale metadata.
- Treat `meeting-note.md` and everything in `exports/` as derived and regenerable.

## Speaker metadata and rename lifecycle

`speakers.json` is the local source of editable speaker display names. A rename trims and validates
the supplied name, updates only the matching speaker's nullable `name`, and atomically replaces the
speaker snapshot. Clearing a name, including saving an empty or whitespace-only value, stores
`null`. The stable `id`, fallback `label`, and transcript turns are not rewritten.

When `speakers.json` is absent, the desktop initializes it from unique stable IDs in
`final-transcript.json`, or from finalized events in `live-transcript.jsonl` when no final
transcript exists. Generated labels use `Speaker N` for `SPEAKER_NN` and `Unknown speaker` for
`UNKNOWN`. This recovery is local and makes no server request.

Transcript display resolves a turn's speaker in this order: current `speakers.json` name, current
speaker label, the turn's nullable `speakerName` snapshot, the turn's stable `speakerId` (or legacy
`speaker` field), then `UNKNOWN`. The server does not infer real names.

## Validation boundaries

Every file must belong to the meeting named by its parent folder. Transcript turn `meetingId`
values must match `metadata.id`; speaker references must resolve in `speakers.json` or use
`UNKNOWN`; offsets must be finite, non-negative seconds with `end >= start`.

The JSON Schemas in [`schemas/`](schemas/) are documentation and validation fixtures for future
work. They do not prescribe a particular runtime validation library.

## Privacy boundary

Meeting folders can contain sensitive audio and dialogue. They remain local unless a user invokes
an explicit processing or export action. API keys, server credentials, and real meeting data do
not belong in meeting files, schemas, examples, or the repository.
