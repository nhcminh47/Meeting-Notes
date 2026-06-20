# ASR Gateway Server

The ASR Gateway is the authenticated, ephemeral remote-processing boundary for Local Whisper
Studio. It provides configuration, safe request logging, API-key authentication, diagnostic
placeholder endpoints, and managed ephemeral workspaces. It is not a meeting archive. Any audio,
result, or job artifacts placed in these workspaces are temporary and must never be treated as
durable meeting data.

English live ASR v1 is implemented over authenticated WebSocket PCM. The final transcript job API
provides English batch ASR with optional speaker-aware post-processing and safe single-speaker
fallback. A real diarization adapter, model downloads, and production desktop final-transcript
integration are not yet packaged.

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

For real live or final ASR, install `pip install -e ".[dev,asr]"`. The default backends lazily load
`faster-whisper` models `small.en` and `medium.en`; model acquisition and device selection follow
faster-whisper's runtime behavior. Set `LIVE_FAKE_ASR=true` or `FINAL_FAKE_ASR=true` only for tests
or deliberate API development. The server never silently substitutes fake transcripts.

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
| `POST /jobs/finalize` | Bearer token | Upload and process a temporary recording |
| `GET /jobs/{jobId}` | Bearer token | Read safe final-job status |
| `GET /jobs/{jobId}/result` | Bearer token | Read a completed normalized transcript |
| `POST /jobs/{jobId}/cancel` | Bearer token | Cancel queued/running work |

## English live ASR v1

Connect to `WS /live/sessions/{sessionId}/stream` without credentials in the URL. The first message
must be `{"type":"auth","apiKey":"<user-provided-api-key>","language":"en"}`. `language` may be
omitted and defaults to English. Vietnamese and every non-English live mode are rejected. Once
`session_started` is received, send paced binary chunks containing 16 kHz mono signed 16-bit
little-endian PCM. Send `{"type":"close"}` for a clean `session_closed` response.

The server emits `partial` events for revisable text and `turn_final` for committed dialogue. A
turn keeps one stable ID until committed; IDs then increment. V1 uses `SPEAKER_01` for every turn
and performs no diarization. Empty or whitespace-only backend results are ignored. The reusable
speaker turn builder commits each final ASR segment as one turn and does not merge adjacent final
segments in v1. Chunks are passed directly to the backend (simple chunk boundaries plus
faster-whisper VAD); the server does not yet resample, negotiate formats, merge overlapping context,
or provide reconnect/resume semantics.

Every transcript event contains `sessionId`, `turnId`, `speaker`, `start`, `end`, `text`,
`source: "live"`, and `isFinal`. Partial events keep `isFinal: false`, reuse the current turn ID,
and do not advance the committed counter. They are intended for transient UI display. Final events
use `type: "turn_final"` and `isFinal: true`; these are the events the desktop can translate and
append to its locally owned `live-transcript.jsonl`. The server does not persist either form.

Audio is retained only in a bounded in-memory buffer and cleared on clean close, disconnect,
timeout, or error. Audio, auth payloads, and transcript text are not logged or written to workspace
storage. `MAX_CONCURRENT_LIVE_SESSIONS`, `LIVE_AUDIO_BUFFER_SECONDS`, and
`LIVE_SESSION_TTL_MINUTES` bound live resource use.

## Final transcript jobs v1

Send `POST /jobs/finalize` as multipart form data with an audio `file`, optional client-owned
`meetingId`, and optional `language=en`. `MAX_UPLOAD_MB` bounds the upload. V1 processes the request
synchronously, so success reports `completed`; the persisted status API can support a future
asynchronous queue. `MAX_CONCURRENT_JOBS` is shared within one server process. Multi-worker or
distributed coordination is not yet provided.

`DEFAULT_FINAL_ENGINE=faster-whisper` loads `DEFAULT_FINAL_MODEL=medium.en`. Tests explicitly set
`FINAL_FAKE_ASR=true`, producing deterministic dialogue without a GPU or model download. This is
never an automatic production fallback.

Results contain ordered turns with stable incremental IDs, `source: "final"`, `isFinal: true`, and
null `speakerName`. With final diarization enabled and an available backend, ASR segments are
assigned to the speaker range with maximum time overlap. Backend labels normalize deterministically
to `SPEAKER_01`, `SPEAKER_02`, and so on by first transcript appearance; no-overlap segments use
`UNKNOWN`.

`diarizationStatus` reports `applied`, `unavailable`, `failed`, or `empty`. Diarization is
best-effort: unavailable, malformed, empty, and exception paths still complete with a valid
single-speaker `SPEAKER_01` transcript. Backend exceptions and temporary paths are not exposed.
ASR failure still fails the job.

The server currently ships only the disabled diarization backend. `DiarizationBackend` is the
plug-in boundary for a later WhisperX/pyannote adapter. To prepare a deployment, set
`ENABLE_FINAL_DIARIZATION=true`, select the adapter with `DIARIZATION_BACKEND`, and configure
`DIARIZATION_MODEL`; until an adapter is packaged the status remains `unavailable`. If a future
pyannote adapter requires `PYANNOTE_AUTH_TOKEN`, inject it through the environment. Never commit or
log that token, and do not put it in request URLs. Tests use deterministic fake backends and need
no GPU, model download, network access, or token.

The server does not identify real people or provide speaker rename UI. It creates no notes,
summaries, action items, or exports. Vietnamese diarization and batch transcription remain later
work.

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

`MAX_TMP_STORAGE_GB` supplies a temporary-storage guard. The guard runs expiry cleanup,
then reports whether the root remains over its limit; it never evicts active, non-expired work just
to create capacity. `DELETE_INPUT_AFTER_JOB` removes final-job uploads after processing.
`DELETE_RESULT_AFTER_READ` removes a result after successful delivery while preserving status
metadata until TTL cleanup.

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
