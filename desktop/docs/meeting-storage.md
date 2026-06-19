# Meeting Storage

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
