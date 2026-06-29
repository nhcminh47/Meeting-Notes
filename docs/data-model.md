# Meeting Data Model

## Ownership and source of truth

The Electron desktop client owns every durable meeting record. Remote ASR services may receive
audio and return transcript results, but server session and job identifiers are temporary
correlation values only. They are not meeting ownership keys, and the server is not a backup or
durable meeting store.

The canonical transcript is an ordered sequence of speaker turns. Meeting notes, bullet lists,
summaries, decisions, action items, and exports are derived artifacts and must not replace the
speaker-turn dialogue.

## Meeting

A `Meeting` describes one client-owned meeting folder.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable client-generated meeting ID, also used as the folder name. |
| `title` | string | User-editable display title. |
| `language` | string | BCP 47 language tag for the meeting, initially `en`. |
| `status` | enum | `created`, `recording`, `processing`, `completed`, `failed`, or `cancelled`. |
| `createdAt` | timestamp | UTC ISO 8601 creation time. |
| `startedAt` | timestamp or null | UTC time recording began. |
| `endedAt` | timestamp or null | UTC time recording ended. |
| `recordingPath` | string | Meeting-relative path to the retained recording. |
| `liveTranscriptPath` | string | Meeting-relative path to append-only live turns. |
| `finalTranscriptPath` | string | Meeting-relative path to the normalized final transcript. |
| `speakersPath` | string | Meeting-relative path to speaker metadata. |
| `notePath` | string | Meeting-relative path to the derived note. |
| `exportsPath` | string | Meeting-relative path to generated exports. |
| `serverSessionId` | string, optional | Temporary remote correlation value; never an ownership key. |
| `finalized` | boolean | Whether the normalized final transcript has been committed locally. |

Paths are relative to the meeting folder so a meeting remains portable if the application's OS
base directory changes. `finalized` is independent from `status`: for example, a cancelled meeting
can retain recoverable live turns while remaining unfinalized.

Example `metadata.json`:

```json
{
  "schemaVersion": 1,
  "id": "mtg_20260617_001",
  "title": "Product roadmap sync",
  "language": "en",
  "status": "completed",
  "createdAt": "2026-06-17T16:00:00.000Z",
  "startedAt": "2026-06-17T16:01:12.000Z",
  "endedAt": "2026-06-17T16:43:08.000Z",
  "recordingPath": "recording.wav",
  "liveTranscriptPath": "live-transcript.jsonl",
  "finalTranscriptPath": "final-transcript.json",
  "speakersPath": "speakers.json",
  "notePath": "meeting-note.md",
  "exportsPath": "exports",
  "serverSessionId": "session_temporary_7f3a",
  "finalized": true
}
```

## Speaker

A `Speaker` separates stable transcript identity from a user-editable display name.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable ID such as `SPEAKER_01`, `SPEAKER_02`, or `UNKNOWN`. |
| `label` | string | Stable fallback label such as `Speaker 1` or `Unknown speaker`. |
| `name` | string or null | Optional user-editable display name. |
| `source` | string, optional | Provenance such as `live`, `final`, `manual`, or `imported`. |

Renaming a speaker changes `name`, not `id`, and is performed locally without server inference.
Existing transcript turns continue to reference the stable ID and are not rewritten. A rendered
transcript resolves display text from the current speaker `name`, then `label`, then the turn's
denormalized `speakerName`, then its stable `speakerId`/`speaker`, and finally `UNKNOWN`.

Example `speakers.json`:

```json
{
  "schemaVersion": 1,
  "meetingId": "mtg_20260617_001",
  "speakers": [
    {
      "id": "SPEAKER_01",
      "label": "Speaker 1",
      "name": "Alex",
      "source": "manual"
    },
    {
      "id": "SPEAKER_02",
      "label": "Speaker 2",
      "name": null,
      "source": "final"
    },
    {
      "id": "UNKNOWN",
      "label": "Unknown speaker",
      "name": null
    }
  ]
}
```

## TranscriptTurn

A `TranscriptTurn` is one time-bounded utterance in the canonical dialogue.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable turn ID within the meeting. |
| `meetingId` | string | Owning local meeting ID. |
| `speakerId` | string | Stable speaker ID, including `UNKNOWN` when unresolved. |
| `speakerName` | string or null | Optional display-name snapshot; never replaces `speakerId`. |
| `start` | number | Start offset in seconds from the recording. |
| `end` | number | End offset in seconds from the recording. |
| `text` | string | Spoken dialogue text. |
| `language` | string | BCP 47 language tag for this turn. |
| `source` | enum | `live`, `final`, `manual`, or `imported`. |
| `isFinal` | boolean | Whether the text is committed rather than an interim hypothesis. |
| `confidence` | number or null | Optional confidence in the inclusive range 0 through 1. |
| `createdAt` | timestamp, optional | UTC ISO 8601 creation time. |
| `updatedAt` | timestamp, optional | UTC ISO 8601 last-edit time. |

Turns in the normalized final transcript are ordered by `start`, with `id` as a deterministic
tie-breaker. Every final turn has `isFinal: true`; later manual edits keep the stable turn ID and set
`source` to `manual`.

## Local files

The OS-specific base path varies (for example, Electron's `userData` directory), but contents of
each meeting folder are consistent:

```text
AppData/
  LocalWhisperStudio/
    meetings/
      mtg_20260617_001/
        metadata.json
        recording.wav
        live-transcript.jsonl
        final-transcript.json
        speakers.json
        meeting-note.md
        exports/
```

- `metadata.json` is the client-owned meeting record.
- `recording.wav` is the retained local recording when recording is enabled.
- `live-transcript.jsonl` is the append-only crash-recovery log of finalized live turns.
- `final-transcript.json` is the normalized canonical speaker-turn transcript after finalization.
- `speakers.json` stores stable IDs and editable display names.
- `meeting-note.md` and `exports/` contain derived artifacts that can be regenerated.

`meeting-note.md` is generated from `final-transcript.json` speaker turns, with current display
names resolved from `speakers.json`. It is never used as input to regenerate itself, and the live
JSONL recovery log is not a default summary source. Regeneration replaces only this derived file;
the canonical final transcript and append-only live transcript remain unchanged.

`exports/` is created on demand for user-triggered local exports. Transcript exports are derived
from `final-transcript.json` by default as `transcript.txt`, `transcript.json`, `transcript.srt`,
and `transcript.vtt`. Meeting note export copies `meeting-note.md` to `exports/meeting-note.md`.
Export rendering uses the same speaker display order as transcript display: `speakers.json` name,
speaker label, turn `speakerName`, stable `speakerId`/legacy `speaker`, then `UNKNOWN`. Export
files are local derived artifacts; the server does not store them.

### Append-only live transcript

Each complete line in `live-transcript.jsonl` is an independent JSON event. Writers append a
newline-terminated `turn_final` event only after a live turn becomes final; they never rewrite or
truncate earlier events. Readers ignore an incomplete trailing line after a crash. Interim UI text
may remain in memory and is not required to be durable. Remote `partial` events use a temporary
server `sessionId` for correlation and must not be appended as committed turns. When accepting a
remote `turn_final`, the desktop remains responsible for associating it with its local `meetingId`
before persistence.

```jsonl
{"type":"turn_final","meetingId":"mtg_20260617_001","turnId":"turn_001","speakerId":"SPEAKER_01","speakerName":null,"start":12.4,"end":18.9,"text":"I think we should prioritize English live meetings first.","language":"en","source":"live","isFinal":true}
{"type":"turn_final","meetingId":"mtg_20260617_001","turnId":"turn_002","speakerId":"SPEAKER_02","speakerName":null,"start":19.2,"end":25.6,"text":"Agreed, but we still need a final transcript after the meeting.","language":"en","source":"live","isFinal":true}
```

### Normalized final transcript

`final-transcript.json` is a replaceable, normalized snapshot. It contains ordered turns rather
than notes or pre-rendered prose. It should be written to a temporary sibling file and atomically
renamed into place before `metadata.finalized` becomes `true`.

```json
{
  "schemaVersion": 1,
  "meetingId": "mtg_20260617_001",
  "language": "en",
  "generatedAt": "2026-06-17T16:44:10.000Z",
  "turns": [
    {
      "id": "turn_001",
      "meetingId": "mtg_20260617_001",
      "speakerId": "SPEAKER_01",
      "speakerName": "Alex",
      "start": 12.4,
      "end": 18.9,
      "text": "I think we should prioritize English live meetings first.",
      "language": "en",
      "source": "final",
      "isFinal": true,
      "confidence": 0.96
    },
    {
      "id": "turn_002",
      "meetingId": "mtg_20260617_001",
      "speakerId": "SPEAKER_02",
      "speakerName": null,
      "start": 19.2,
      "end": 25.6,
      "text": "Agreed, but we still need a final transcript after the meeting.",
      "language": "en",
      "source": "final",
      "isFinal": true,
      "confidence": null
    }
  ]
}
```

The same turns may be rendered for people without changing the stored source of truth:

```text
[00:00:12] Speaker 1: I think we should prioritize English live meetings first.

[00:00:19] Speaker 2: Agreed, but we still need a final transcript after the meeting.
```

## Schema evolution

Structured snapshot files carry an integer `schemaVersion`. Version 1 readers must reject unknown
future versions rather than silently discarding fields. Future migrations operate locally and
preserve stable meeting, speaker, and turn IDs. JSONL events are versioned by event `type`; new event
types must be safely ignorable by older readers.

Documentation-only JSON Schemas live in `desktop/docs/schemas/` and define the version 1 contract.
