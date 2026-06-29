from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import wave


EXPECTED_SAMPLE_RATE = 16_000
EXPECTED_CHANNELS = 1
EXPECTED_SAMPLE_WIDTH_BYTES = 2


@dataclass(frozen=True)
class PcmAudioFixture:
    path: Path
    duration_seconds: float
    sample_rate: int
    channels: int
    sample_width_bytes: int
    pcm: bytes


def load_pcm_wav(audio_path: Path) -> PcmAudioFixture:
    path = audio_path.expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError("Audio file does not exist.")

    try:
        with wave.open(str(path), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_rate = wav_file.getframerate()
            sample_width = wav_file.getsampwidth()
            frames = wav_file.getnframes()
            pcm = wav_file.readframes(frames)
    except wave.Error as exc:
        raise ValueError("Audio must be an uncompressed WAV file.") from exc

    if channels != EXPECTED_CHANNELS:
        raise ValueError("Benchmark WAV must be mono.")
    if sample_rate != EXPECTED_SAMPLE_RATE:
        raise ValueError("Benchmark WAV must be 16 kHz.")
    if sample_width != EXPECTED_SAMPLE_WIDTH_BYTES:
        raise ValueError("Benchmark WAV must use signed 16-bit PCM samples.")
    if not pcm:
        raise ValueError("Benchmark WAV must contain audio samples.")

    return PcmAudioFixture(
        path=path,
        duration_seconds=frames / sample_rate,
        sample_rate=sample_rate,
        channels=channels,
        sample_width_bytes=sample_width,
        pcm=pcm,
    )


def split_pcm_chunks(pcm: bytes, chunk_seconds: float) -> list[bytes]:
    if chunk_seconds <= 0:
        raise ValueError("chunk_seconds must be greater than zero.")
    bytes_per_second = EXPECTED_SAMPLE_RATE * EXPECTED_SAMPLE_WIDTH_BYTES
    chunk_bytes = int(bytes_per_second * chunk_seconds)
    chunk_bytes -= chunk_bytes % EXPECTED_SAMPLE_WIDTH_BYTES
    if chunk_bytes <= 0:
        raise ValueError("chunk_seconds is too small for 16-bit PCM chunks.")
    return [pcm[index : index + chunk_bytes] for index in range(0, len(pcm), chunk_bytes)]
