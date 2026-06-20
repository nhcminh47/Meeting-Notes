# ASR Gateway Server

The ASR Gateway is the authenticated, ephemeral remote-processing boundary for Local Whisper
Studio. It provides configuration, safe request logging, API-key authentication, diagnostic
placeholder endpoints, and managed ephemeral workspaces. It is not a meeting archive. Any audio,
result, or job artifacts placed in these workspaces are temporary and must never be treated as
durable meeting data.

English live ASR v1 is implemented over authenticated WebSocket PCM. Final transcript jobs,
diarization, model downloads, and production desktop integration are not implemented.

## Run locally

Python 3.11 or newer is required.

```powershell
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
$env:SERVER_API_KEY = "replace-with-a-local-development-key"
uvicorn app.main:app --reload
```

For real live ASR, install `pip install -e ".[dev,live]"`. The default backend lazily loads
`faster-whisper` model `small.en`; model acquisition and device selection follow faster-whisper's
runtime behavior. Set `LIVE_FAKE_ASR=true` only for tests or deliberate transport development; the
server never silently substitutes fake transcripts when the real backend is unavailable.

Run tests with `pytest`. The public health endpoint is available at
`http://localhost:8000/health`.

## Authentication

Set `SERVER_API_KEY` in the process environment. Do not commit a `.env` file or a real key.
Protected requests use the header:

```http
Authorization: Bearer <apiKey>
```

The request logger never records headers, bodies, audio, or transcript content.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `GET /health` | Public | Minimal, non-sensitive liveness check |
| `GET /health/private` | Bearer token | Safe configuration diagnostics |
| `GET /engines` | Bearer token | Configured engine placeholders |
| `GET /models` | Bearer token | Configured model names |
| `GET /admin/storage` | Bearer token | Safe temporary-storage usage and workspace counts |
| `POST /admin/cleanup` | Bearer token | Run TTL and orphan cleanup and report safe totals |
| `WS /live/sessions/{sessionId}/stream` | First-message API key | English live ASR over binary PCM |

## English live ASR v1

Connect to `WS /live/sessions/{sessionId}/stream` without credentials in the URL. The first message
must be `{"type":"auth","apiKey":"<user-provided-api-key>","language":"en"}`. `language` may be
omitted and defaults to English. Vietnamese and every non-English live mode are rejected. Once
`session_started` is received, send paced binary chunks containing 16 kHz mono signed 16-bit
little-endian PCM. Send `{"type":"close"}` for a clean `session_closed` response.

The server emits `partial` events for revisable text and `turn_final` for committed dialogue. A
turn keeps one stable ID until committed; IDs then increment. V1 uses `SPEAKER_01` for every turn
and performs no diarization. Chunks are passed directly to the backend (simple chunk boundaries plus
faster-whisper VAD); the server does not yet resample, negotiate formats, merge overlapping context,
or provide reconnect/resume semantics.

Audio is retained only in a bounded in-memory buffer and cleared on clean close, disconnect,
timeout, or error. Audio, auth payloads, and transcript text are not logged or written to workspace
storage. `MAX_CONCURRENT_LIVE_SESSIONS`, `LIVE_AUDIO_BUFFER_SECONDS`, and
`LIVE_SESSION_TTL_MINUTES` bound live resource use.

## Ephemeral temporary storage

`SERVER_STORAGE_MODE=ephemeral` is the only supported storage model. `ASR_TMP_DIR` configures the
managed root (default `/tmp/asr-gateway`) with `sessions/`, `jobs/`, and `chunks/` children. Each
session and job directory contains `.workspace.json` metadata with its ID, kind, status, and UTC
creation, update, and expiry timestamps.

Running sessions and jobs expire according to `LIVE_SESSION_TTL_MINUTES` and
`JOB_WORKSPACE_TTL_MINUTES`. Completed and failed jobs receive their configured terminal TTL;
cancelled jobs are eligible for immediate cleanup. Cleanup also removes direct child folders whose
metadata is missing or invalid. It is repeatable and refuses to target paths outside the managed
session and job roots.

`MAX_TMP_STORAGE_GB` supplies a guard for future processing routes. The guard runs expiry cleanup,
then reports whether the root remains over its limit; it never evicts active, non-expired work just
to create capacity. `DELETE_RESULT_AFTER_READ` controls the result-removal hook reserved for a
future final-job implementation.

The admin responses expose only paths, byte totals, counts, and safe cleanup errors. They never
return audio, transcript text, request bodies, authorization headers, or API keys.

## Docker

From `server/`, set the API key in your shell and start the service:

```powershell
$env:SERVER_API_KEY = "replace-with-a-local-development-key"
docker compose up --build
```

GPU access is optional and disabled by default. The comments in `docker-compose.yml` show where a
deployment may add NVIDIA device reservations later. The gateway starts without a GPU.

All processing added in future issues must obey the ephemeral storage policy: temporary artifacts
must be deleted after processing or TTL expiry, while durable meeting data remains on the desktop.
