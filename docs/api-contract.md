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

The server bounds audio in memory, enforces session concurrency and TTL settings, and clears the
buffer on every close/error path. It writes no live audio or transcript to durable storage.
