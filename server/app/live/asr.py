from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from array import array
from dataclasses import dataclass

from app.config import Settings


@dataclass(frozen=True)
class AsrResult:
    text: str
    start: float
    end: float
    is_final: bool


class LiveAsrBackend(ABC):
    @abstractmethod
    async def transcribe_chunk(self, audio: bytes, *, session_id: str) -> list[AsrResult]:
        raise NotImplementedError

    async def close(self) -> None:
        return None


class FakeLiveAsr(LiveAsrBackend):
    """Deterministic backend enabled explicitly for tests and transport development."""

    def __init__(self):
        self._chunks = 0

    async def transcribe_chunk(self, audio: bytes, *, session_id: str) -> list[AsrResult]:
        self._chunks += 1
        if self._chunks % 2:
            return [AsrResult("Test partial transcript", 0.0, len(audio) / 32_000, False)]
        return [AsrResult("Test final transcript", 0.0, len(audio) / 32_000, True)]


class FasterWhisperLiveAsr(LiveAsrBackend):
    def __init__(self, model_name: str):
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper is not installed; install the server live optional dependency"
            ) from exc
        self._model = WhisperModel(model_name)

    async def transcribe_chunk(self, audio: bytes, *, session_id: str) -> list[AsrResult]:
        return await asyncio.to_thread(self._transcribe, audio)

    def _transcribe(self, audio: bytes) -> list[AsrResult]:
        try:
            import numpy as np
        except ImportError as exc:
            raise RuntimeError("numpy is required by the faster-whisper live backend") from exc
        samples = array("h")
        samples.frombytes(audio)
        normalized = np.asarray(samples, dtype=np.float32) / 32768.0
        segments, _ = self._model.transcribe(
            normalized, language="en", task="transcribe", vad_filter=True, beam_size=1
        )
        return [
            AsrResult(segment.text.strip(), float(segment.start), float(segment.end), True)
            for segment in segments
            if segment.text.strip()
        ]


def create_live_asr_backend(settings: Settings) -> LiveAsrBackend:
    if settings.live_fake_asr:
        return FakeLiveAsr()
    if settings.default_live_engine == "faster-whisper-live":
        return FasterWhisperLiveAsr(settings.default_live_model)
    raise RuntimeError(f"Unsupported live ASR engine: {settings.default_live_engine}")
