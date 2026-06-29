from __future__ import annotations

import asyncio
import json
from pathlib import Path
import wave

import pytest

from app.benchmarks.live_engine_benchmark import (
    main_async,
    parse_engine_ids,
    run_live_benchmark,
)
from app.benchmarks.metrics import calculate_real_time_factor, percentile


def test_metric_aggregation_calculates_percentiles() -> None:
    values = [100.0, 200.0, 300.0, 400.0]
    assert percentile(values, 50) == 250.0
    assert percentile(values, 95) == 385.0


def test_real_time_factor_calculation() -> None:
    assert calculate_real_time_factor(5000, 25) == 0.2
    assert calculate_real_time_factor(5000, 0) is None


def test_unsupported_engine_is_rejected_safely() -> None:
    with pytest.raises(ValueError, match="Unsupported benchmark engine"):
        parse_engine_ids("fake,unknown-engine")


def test_fake_backend_benchmark_produces_valid_private_result(tmp_path: Path) -> None:
    audio = tmp_path / "synthetic.wav"
    output = tmp_path / "nested" / "live-engines.json"
    _write_synthetic_wav(audio, duration_seconds=2)

    result = asyncio.run(
        run_live_benchmark(
            audio_path=audio,
            engine_ids=["fake"],
            output_path=output,
            chunk_seconds=1.0,
        )
    )

    assert output.exists()
    assert result["schemaVersion"] == 1
    assert result["input"]["durationSeconds"] == 2.0
    assert len(result["runs"]) == 1
    run = result["runs"][0]
    assert run["engine"] == "fake"
    assert run["model"] == "fake-live"
    assert run["ok"] is True
    assert run["metrics"]["chunks"] == 2
    assert run["metrics"]["partialEvents"] == 1
    assert run["metrics"]["finalTurns"] == 1
    assert "transcriptEvents" not in run

    saved = json.loads(output.read_text(encoding="utf-8"))
    assert "Test final transcript" not in json.dumps(saved)


def test_include_transcript_flag_adds_transcript_events(tmp_path: Path) -> None:
    audio = tmp_path / "synthetic.wav"
    output = tmp_path / "live-engines.json"
    _write_synthetic_wav(audio, duration_seconds=2)

    result = asyncio.run(
        run_live_benchmark(
            audio_path=audio,
            engine_ids=["fake"],
            output_path=output,
            chunk_seconds=1.0,
            include_transcript=True,
        )
    )

    run = result["runs"][0]
    assert "transcriptEvents" in run
    assert any(event["type"] == "turn_final" for event in run["transcriptEvents"])


def test_missing_audio_path_returns_safe_error(tmp_path: Path, capsys) -> None:
    exit_code = asyncio.run(
        main_async(
            [
                "--audio",
                str(tmp_path / "missing.wav"),
                "--engines",
                "fake",
                "--output",
                str(tmp_path / "out.json"),
            ]
        )
    )

    captured = capsys.readouterr()
    assert exit_code == 2
    assert "Audio file does not exist." in captured.err


def test_output_path_is_created_safely(tmp_path: Path) -> None:
    audio = tmp_path / "synthetic.wav"
    output = tmp_path / "new" / "folder" / "live-engines.json"
    _write_synthetic_wav(audio, duration_seconds=1)

    asyncio.run(
        run_live_benchmark(
            audio_path=audio,
            engine_ids=["fake"],
            output_path=output,
            chunk_seconds=0.5,
        )
    )

    assert output.is_file()


def _write_synthetic_wav(path: Path, *, duration_seconds: int) -> None:
    sample_rate = 16_000
    frames = b"\x00\x00" * sample_rate * duration_seconds
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(frames)
