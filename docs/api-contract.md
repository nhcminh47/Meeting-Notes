# Remote ASR API Contract

This document sets constraints for the later gateway implementation; it does not define final wire
formats.

## Requirements

- Protected endpoints require an API key, sent in an authorization header rather than a URL.
- Requests carry audio or short-lived audio references plus language and processing options.
- Responses carry job status and an ordered speaker-turn transcript with timestamps and text.
- Errors use stable machine-readable codes and safe human-readable messages.
- Health checks disclose no secrets or meeting content.
- Clients must tolerate retries and unavailable remote processing without losing local meetings.

The server must not return bullet notes as the canonical transcript. Temporary request, audio, job,
and result files are deleted after delivery, terminal failure, or TTL expiry.

## Gateway foundation endpoints

Issue #15 establishes these JSON endpoints:

- `GET /health` is public and returns only service liveness.
- `GET /health/private`, `GET /engines`, and `GET /models` require an
  `Authorization: Bearer <apiKey>` header.
- Authentication failures use `{"error":{"code":"UNAUTHORIZED","message":"..."}}` with HTTP
  status 401.

Engine and model responses are configuration placeholders only. They do not indicate that ASR
inference, streaming, or transcript jobs are available.

## English live ASR v1

The English live endpoint is `WS /live/sessions/{sessionId}/stream`. It accepts paced binary
16 kHz mono signed 16-bit little-endian PCM. Clients must resample and downmix before sending;
other formats are not negotiated in v1.

The first client message must be `{"type":"auth","apiKey":"..."}`. Credentials in URL query
parameters are rejected. The optional `language` field defaults to `en`; any other value is
rejected, and Vietnamese realtime is not exposed. After authentication, the server sends
`session_started`. A JSON `{"type":"close"}` message returns `session_closed` and closes the socket.
Authentication failures return a safe `UNAUTHORIZED` event and close the connection.

Transcript messages are speaker-turn dialogue. `partial` revises the current stable turn ID and
has `isFinal: false`; `turn_final` commits that turn with `isFinal: true`, after which the next turn
uses the next ID (`turn_001`, `turn_002`, and so on). Both include `speaker`, `start`, `end`, `text`,
and `source: "live"`. V1 labels every turn `SPEAKER_01`; diarization is deferred.

```json
{
  "type": "partial",
  "sessionId": "srv_live_abc",
  "turnId": "turn_001",
  "speaker": "SPEAKER_01",
  "start": 12.4,
  "end": 15.2,
  "text": "I think we should",
  "source": "live",
  "isFinal": false
}
```

```json
{
  "type": "turn_final",
  "sessionId": "srv_live_abc",
  "turnId": "turn_001",
  "speaker": "SPEAKER_01",
  "start": 12.4,
  "end": 18.9,
  "text": "I think we should prioritize English live meetings first.",
  "source": "live",
  "isFinal": true
}
```

The reusable speaker turn builder ignores empty or whitespace-only hypotheses. Partial hypotheses
reuse the current ID without advancing the committed counter. In v1, each final ASR segment commits
exactly one turn; adjacent final segments are not merged. This gives backends and tests a simple,
deterministic boundary rule while real diarization and richer segmentation remain deferred.

Only `turn_final` events are suitable for the desktop's append-only `live-transcript.jsonl`.
`partial` events are revisable UI state and are not durable source of truth by default. The desktop
may translate the temporary server `sessionId` correlation field to its locally owned `meetingId`
when persisting a finalized turn.

The desktop derives this endpoint from the saved HTTP(S) server base URL by switching only the
scheme to WS(S) and appending the session route. It clears any query or fragment and never places
the API key in the URL. Renderer-facing clients receive safe status/event data only; credential
lookup and the authentication message remain in the Electron main process.

The server bounds audio in memory, enforces session concurrency and TTL settings, and clears the
buffer on every close/error path. It writes no live audio or transcript to durable storage.

## Final transcript jobs

All final-job endpoints require `Authorization: Bearer <apiKey>`; query-string credentials are
ignored. V1 runs processing synchronously inside `POST /jobs/finalize`, while preserving a job
resource and status contract for a future queue. A successful create returns `status: "completed"`.

| Endpoint | Purpose |
| --- | --- |
| `POST /jobs/finalize` | Accept a temporary multipart recording and run English final ASR. |
| `GET /jobs/{jobId}` | Return safe lifecycle timestamps and status. |
| `GET /jobs/{jobId}/result` | Return the normalized completed transcript. |
| `POST /jobs/{jobId}/cancel` | Mark queued/running work cancelled and cleanup-eligible. |

The create request contains required `file`, optional `meetingId`, and optional `language`
(default `en`). Empty files return `EMPTY_UPLOAD`; files over `MAX_UPLOAD_MB` return
`UPLOAD_TOO_LARGE`. Common audio extensions are retained for decoder compatibility; unknown
extensions become `.bin`, and the supplied filename never controls the workspace path. Other
languages return `INVALID_LANGUAGE`.

Statuses are `queued`, `running`, `completed`, `failed`, `cancelled`, and `expired`.
`MAX_CONCURRENT_JOBS` is an in-process limit; saturation returns `JOB_CONCURRENCY_LIMIT`.
Multi-process coordination and distributed queueing are future work.

```json
{
  "schemaVersion": 1,
  "jobId": "job_abc123",
  "meetingId": "mtg_20260617_001",
  "language": "en",
  "generatedAt": "2026-06-20T10:01:15.000Z",
  "diarizationStatus": "applied",
  "turns": [{
    "id": "turn_001", "meetingId": "mtg_20260617_001",
    "speakerId": "SPEAKER_01", "speakerName": null,
    "start": 0.0, "end": 3.2, "text": "Hello everyone, let's begin.",
    "language": "en", "source": "final", "isFinal": true, "confidence": null
  }]
}
```

Turns are ordered by start time and assigned stable incremental IDs. When enabled and available,
final diarization ranges are matched to ASR segments by maximum time overlap. Raw backend labels
are normalized to `SPEAKER_01`, `SPEAKER_02`, and so on in first-appearance order; a segment with
no overlap uses `UNKNOWN`. The server does not infer names, so `speakerName` remains null.

`diarizationStatus` is `applied`, `unavailable`, `failed`, or `empty`. Diarization is best-effort:
an unavailable backend, exception, empty output, or malformed output does not fail successful ASR.
Those paths return a valid single-speaker transcript using `SPEAKER_01`. Results remain dialogue,
not bullet notes, summaries, or action items. Vietnamese batch transcription remains future work.

Errors use the standard safe error shape. Final jobs may return `UNAUTHORIZED`, `EMPTY_UPLOAD`,
`UPLOAD_TOO_LARGE`, `INVALID_LANGUAGE`, `JOB_NOT_FOUND`, `JOB_NOT_READY`,
`JOB_CONCURRENCY_LIMIT`, `JOB_CANCELLED`, `JOB_FAILED`, or `PROCESSING_ERROR`. Responses never
disclose credentials, content, or temporary paths.
