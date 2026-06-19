# ASR Gateway Server

The ASR Gateway is the authenticated, ephemeral remote-processing boundary for Local Whisper
Studio. This foundation provides configuration, safe request logging, API-key authentication, and
diagnostic placeholder endpoints. It is not a meeting archive and does not persist audio,
transcripts, jobs, or other meeting data.

ASR inference, model downloads, streaming, transcript jobs, diarization, and desktop integration
are intentionally not implemented in issue #15.

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
