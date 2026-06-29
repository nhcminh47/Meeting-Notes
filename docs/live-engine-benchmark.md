# Live Engine Benchmark

## Purpose

This benchmark is a local spike for comparing live English ASR engines and models. It measures
practical behavior around chunk processing, event timing, rough quality, setup complexity, and
stability without changing the production live transport or the default engine.

The server remains an ephemeral ASR processor. Benchmark results are written only to the local path
chosen by the user and are not durable server-side meeting storage.

## Safe Input Strategy

Do not commit private meeting audio or benchmark output containing transcript text. Use one of:

- A synthetic 16 kHz mono signed 16-bit PCM WAV generated locally.
- A tiny redistributable sample with a clear license.
- A local user-provided WAV path passed with `--audio`.

The harness currently accepts uncompressed WAV input that already matches the live v1 transport
format: 16 kHz, mono, signed 16-bit PCM. Convert or generate audio locally before running the
benchmark. Treat any real meeting audio path as private.

## How To Run

From the repository root:

```powershell
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
cd ..
python scripts/benchmark-live-engines.py `
  --audio .\samples\audio\example.wav `
  --engines fake `
  --output .\benchmark-results\live-engines.json `
  --chunk-seconds 1.0
```

The fake backend runs without GPU access, model downloads, or optional ASR dependencies. To try
`faster-whisper` candidates, install the optional dependencies:

```powershell
cd server
pip install -e ".[dev,live]"
cd ..
python scripts/benchmark-live-engines.py `
  --audio .\samples\audio\example.wav `
  --engines fake,current-default,faster-whisper-small-en `
  --output .\benchmark-results\live-engines.json
```

`--dry-run` validates the audio path, chunking configuration, engine IDs, and output path without
loading backends.

## CLI Options

- `--audio`: required local WAV path.
- `--engines`: comma-separated engine IDs. Defaults to `fake`.
- `--output`: JSON result path. Defaults to `benchmark-results/live-engines.json`.
- `--chunk-seconds`: chunk size in seconds. Defaults to `1.0`.
- `--reference-transcript`: optional local text file for rough WER.
- `--include-transcript`: opt-in transcript event output. Off by default.
- `--dry-run`: write a planned result without loading ASR backends.

The CLI validates that audio exists, creates the output directory, writes JSON atomically, and prints
a summary that excludes transcript text.

## Supported Engines

| Engine ID | Model | Notes |
| --- | --- | --- |
| `fake` | `fake-live` | Deterministic baseline for CI and harness checks. |
| `current-default` | Server `DEFAULT_LIVE_MODEL` | Uses the configured live backend, currently `faster-whisper-live` with `small.en`. |
| `faster-whisper-small-en` | `small.en` | Optional dependency and model download required. |
| `faster-whisper-medium-en` | `medium.en` | Optional dependency and model download required. |
| `faster-whisper-large-v3-turbo` | `large-v3-turbo` | Optional dependency and model download required. |

Future candidates to evaluate separately include Moonshine, NVIDIA Riva/Parakeet, and
`whisper.cpp` streaming. They are documented as candidates only; this spike does not add their
dependencies or production integration.

## Metrics Captured

Each run writes JSON with:

- Engine and model ID.
- Audio duration, chunk size, and chunk count.
- Time to first partial and first final event.
- Average, p50, and p95 chunk processing time.
- Total processing time and real-time factor.
- Final turn count, partial event count, and error count.
- Optional rough word error rate if `--reference-transcript` is supplied.

Real-time factor is `total processing seconds / audio duration seconds`. Values below `1.0` process
faster than realtime; values above `1.0` are slower than realtime.

## Privacy Defaults

Benchmark JSON excludes transcript text by default because transcript content can contain private
meeting data. Use `--include-transcript` only with synthetic, licensed, or deliberately shareable
audio. `benchmark-results/` is ignored by git, and benchmark results should not be committed unless
they are sanitized and intentionally reviewed.

## Findings

This issue adds the harness and verifies the fake backend path without requiring GPU access or
model downloads. The fake baseline is useful for validating result shape, event accounting, and
privacy behavior, but it is not an ASR quality signal.

The current v1 default remains `faster-whisper-live` with `small.en`. This spike does not replace
that default. A production default change should happen only in a separate issue with measured
results, deployment notes, and an ADR or equivalent decision record.

Expected tradeoffs for pending optional runs:

- `small.en`: lowest setup and latency among the faster-whisper candidates, likely the safest v1
  default until measured otherwise.
- `medium.en`: likely better transcript quality at higher CPU/GPU and latency cost.
- `large-v3-turbo`: promising quality/speed tradeoff, but setup, memory use, and hardware behavior
  must be measured before consideration.
- Moonshine, Riva/Parakeet, and `whisper.cpp` streaming need separate dependency and deployment
  evaluation before they belong in the runnable harness.

## Limitations

Benchmarks are not run in CI beyond the deterministic fake backend tests. Optional engines may
download models at runtime according to their own libraries. The harness does not resample,
downmix, diarize, summarize, export, or redesign transport. It does not implement Vietnamese
realtime transcription.
