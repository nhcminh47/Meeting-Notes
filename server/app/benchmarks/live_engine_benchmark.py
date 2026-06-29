from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import tempfile
import sys
import time
from typing import Iterable

from app.config import Settings
from app.live.asr import FakeLiveAsr, FasterWhisperLiveAsr, LiveAsrBackend
from app.live.session import LiveSession

from .fixtures import PcmAudioFixture, load_pcm_wav, split_pcm_chunks
from .metrics import LiveBenchmarkMetrics, word_error_rate

SCHEMA_VERSION = 1
DEFAULT_SESSION_BUFFER_SECONDS = 30
SUPPORTED_ENGINES = {
    "fake",
    "current-default",
    "faster-whisper-small-en",
    "faster-whisper-medium-en",
    "faster-whisper-large-v3-turbo",
}


@dataclass(frozen=True)
class EngineSpec:
    engine_id: str
    engine: str
    model: str


def parse_engine_ids(value: str) -> list[str]:
    engine_ids = [engine.strip() for engine in value.split(",") if engine.strip()]
    if not engine_ids:
        raise ValueError("At least one engine must be provided.")
    unsupported = sorted(set(engine_ids) - SUPPORTED_ENGINES)
    if unsupported:
        raise ValueError(f"Unsupported benchmark engine: {', '.join(unsupported)}")
    return engine_ids


def resolve_engine(engine_id: str, settings: Settings | None = None) -> EngineSpec:
    if engine_id == "fake":
        return EngineSpec(engine_id=engine_id, engine="fake", model="fake-live")
    if engine_id == "current-default":
        active_settings = settings or Settings()
        return EngineSpec(
            engine_id=engine_id,
            engine=active_settings.default_live_engine,
            model=active_settings.default_live_model,
        )
    if engine_id == "faster-whisper-small-en":
        return EngineSpec(engine_id=engine_id, engine="faster-whisper-live", model="small.en")
    if engine_id == "faster-whisper-medium-en":
        return EngineSpec(engine_id=engine_id, engine="faster-whisper-live", model="medium.en")
    if engine_id == "faster-whisper-large-v3-turbo":
        return EngineSpec(
            engine_id=engine_id, engine="faster-whisper-live", model="large-v3-turbo"
        )
    raise ValueError(f"Unsupported benchmark engine: {engine_id}")


def create_backend(spec: EngineSpec) -> LiveAsrBackend:
    if spec.engine == "fake":
        return FakeLiveAsr()
    if spec.engine == "faster-whisper-live":
        return FasterWhisperLiveAsr(spec.model)
    raise RuntimeError(f"Unsupported live benchmark engine: {spec.engine}")


async def run_live_benchmark(
    *,
    audio_path: Path,
    engine_ids: Iterable[str],
    output_path: Path,
    chunk_seconds: float,
    reference_transcript_path: Path | None = None,
    include_transcript: bool = False,
    dry_run: bool = False,
    settings: Settings | None = None,
) -> dict[str, object]:
    fixture = load_pcm_wav(audio_path)
    chunks = split_pcm_chunks(fixture.pcm, chunk_seconds)
    reference_transcript = _read_reference(reference_transcript_path)
    specs = [resolve_engine(engine_id, settings=settings) for engine_id in engine_ids]

    if dry_run:
        result = _base_result(fixture, reference_transcript_path, chunk_seconds)
        result["runs"] = [
            {
                "engine": spec.engine_id,
                "model": spec.model,
                "ok": True,
                "metrics": None,
                "notes": ["dry run only; backend was not loaded"],
            }
            for spec in specs
        ]
    else:
        runs = []
        for spec in specs:
            runs.append(
                await _run_single_engine(
                    spec=spec,
                    fixture=fixture,
                    chunks=chunks,
                    reference_transcript=reference_transcript,
                    include_transcript=include_transcript,
                )
            )
        result = _base_result(fixture, reference_transcript_path, chunk_seconds)
        result["runs"] = runs

    write_json_atomic(output_path, result)
    return result


async def _run_single_engine(
    *,
    spec: EngineSpec,
    fixture: PcmAudioFixture,
    chunks: list[bytes],
    reference_transcript: str | None,
    include_transcript: bool,
) -> dict[str, object]:
    notes: list[str] = []
    transcript_events: list[dict[str, object]] = []
    final_texts: list[str] = []
    metrics = LiveBenchmarkMetrics(audio_duration_seconds=fixture.duration_seconds)
    start = time.perf_counter()
    session: LiveSession | None = None

    try:
        session = LiveSession(
            f"benchmark_{spec.engine_id.replace('-', '_')}",
            create_backend(spec),
            DEFAULT_SESSION_BUFFER_SECONDS,
        )
        for chunk in chunks:
            chunk_started = time.perf_counter()
            events = await session.process(chunk)
            chunk_elapsed_ms = (time.perf_counter() - chunk_started) * 1000
            metrics.chunk_processing_ms.append(chunk_elapsed_ms)
            metrics.chunks += 1
            elapsed_ms = (time.perf_counter() - start) * 1000
            for event in events:
                event_type = event.get("type")
                if event_type == "partial":
                    metrics.partial_events += 1
                    if metrics.time_to_first_partial_ms is None:
                        metrics.time_to_first_partial_ms = elapsed_ms
                elif event_type == "turn_final":
                    metrics.final_turns += 1
                    if metrics.time_to_first_final_ms is None:
                        metrics.time_to_first_final_ms = elapsed_ms
                    if isinstance(event.get("text"), str):
                        final_texts.append(str(event["text"]))
                if include_transcript:
                    transcript_events.append(event)
    except Exception as exc:
        metrics.errors += 1
        notes.append(_safe_error(exc))
        ok = False
    else:
        ok = True
    finally:
        if session is not None:
            await session.close()

    total_processing_ms = (time.perf_counter() - start) * 1000
    wer = None
    if reference_transcript is not None:
        wer = word_error_rate(reference_transcript, " ".join(final_texts))

    run: dict[str, object] = {
        "engine": spec.engine_id,
        "model": spec.model,
        "ok": ok,
        "metrics": metrics.to_json(total_processing_ms, wer=wer),
        "notes": notes,
    }
    if include_transcript:
        run["transcriptEvents"] = transcript_events
    return run


def write_json_atomic(output_path: Path, payload: dict[str, object]) -> None:
    path = output_path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
    ) as tmp_file:
        json.dump(payload, tmp_file, indent=2)
        tmp_file.write("\n")
        tmp_name = tmp_file.name
    Path(tmp_name).replace(path)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark live ASR engines on local WAV audio.")
    default_output_dir = os.environ.get("LIVE_BENCHMARK_OUTPUT_DIR", "benchmark-results")
    parser.add_argument("--audio", required=True, type=Path, help="Local 16 kHz mono PCM WAV path.")
    parser.add_argument(
        "--engines",
        default=os.environ.get("LIVE_BENCHMARK_DEFAULT_ENGINES", "fake"),
        help="Comma-separated benchmark engine IDs.",
    )
    parser.add_argument(
        "--output",
        default=Path(default_output_dir) / "live-engines.json",
        type=Path,
        help="JSON output path.",
    )
    parser.add_argument("--chunk-seconds", default=1.0, type=float, help="PCM chunk length.")
    parser.add_argument("--reference-transcript", type=Path, default=None)
    parser.add_argument("--include-transcript", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser


async def main_async(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    try:
        engine_ids = parse_engine_ids(args.engines)
        result = await run_live_benchmark(
            audio_path=args.audio,
            engine_ids=engine_ids,
            output_path=args.output,
            chunk_seconds=args.chunk_seconds,
            reference_transcript_path=args.reference_transcript,
            include_transcript=args.include_transcript,
            dry_run=args.dry_run,
        )
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        print(f"benchmark error: {_safe_error(exc)}", file=sys.stderr)
        return 2

    print(_summary(result, args.output))
    return 0


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(main_async(argv))


def _base_result(
    fixture: PcmAudioFixture, reference_transcript_path: Path | None, chunk_seconds: float
) -> dict[str, object]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "input": {
            "audioPath": _display_path(fixture.path),
            "durationSeconds": round(fixture.duration_seconds, 3),
            "chunkSeconds": chunk_seconds,
            "referenceTranscriptPath": (
                _display_path(reference_transcript_path) if reference_transcript_path else None
            ),
        },
        "runs": [],
    }


def _read_reference(reference_transcript_path: Path | None) -> str | None:
    if reference_transcript_path is None:
        return None
    path = reference_transcript_path.expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError("Reference transcript file does not exist.")
    return path.read_text(encoding="utf-8")


def _display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(Path.cwd().resolve())).replace("\\", "/")
    except ValueError:
        return str(path.resolve())


def _safe_error(exc: Exception) -> str:
    message = str(exc).strip()
    return message or exc.__class__.__name__


def _summary(result: dict[str, object], output_path: Path) -> str:
    lines = [f"Wrote benchmark JSON to {output_path}"]
    for run in result.get("runs", []):
        if not isinstance(run, dict):
            continue
        metrics = run.get("metrics")
        if isinstance(metrics, dict):
            lines.append(
                " - "
                f"{run.get('engine')} ({run.get('model')}): "
                f"ok={run.get('ok')} "
                f"rtf={metrics.get('realTimeFactor')} "
                f"chunks={metrics.get('chunks')} "
                f"finalTurns={metrics.get('finalTurns')} "
                f"partials={metrics.get('partialEvents')} "
                f"errors={metrics.get('errors')}"
            )
        else:
            lines.append(f" - {run.get('engine')} ({run.get('model')}): dry run")
    return "\n".join(lines)
