# ASR Gateway Server

The ASR Gateway is the authenticated, ephemeral remote-processing boundary for Local Whisper
Studio. It provides configuration, safe request logging, API-key authentication, diagnostic
placeholder endpoints, and managed ephemeral workspaces. It is not a meeting archive. Any audio,
result, or job artifacts placed in these workspaces are temporary and must never be treated as
durable meeting data.

ASR inference, model downloads, production streaming, transcript jobs, diarization, and desktop
integration are not implemented. Issue #18 adds only a dev transport probe.

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
| `WS /live/sessions/{sessionId}/stream` | First-message API key | Dev-only binary transport probe |

## Dev-only live transport probe

Connect to `WS /live/sessions/{sessionId}/stream` without credentials in the URL. The first message
must be `{"type":"auth","apiKey":"<user-provided-api-key>"}`. Once `session_started` is received,
binary messages increment in-memory chunk and byte counters and return `transport_probe` JSON.
Send `{"type":"close"}` for a clean `session_closed` response. Invalid authentication returns a
safe error and closes with code 1008.

This route does not inspect PCM, run ASR, log message bodies, or store chunks. The first-message
API-key exchange is spike-only and may be replaced by short-lived stream tokens in production.

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
