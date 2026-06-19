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
