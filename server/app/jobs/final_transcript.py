from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from app.config import Settings


@dataclass(frozen=True)
class TranscriptSegment:
    text: str
    start: float
    end: float
    confidence: float | None = None


class FinalTranscriptBackend(ABC):
    @abstractmethod
    def transcribe_file(
        self, audio_path: Path, *, meeting_id: str, language: str
    ) -> list[TranscriptSegment]:
        raise NotImplementedError


class FakeFinalTranscriptBackend(FinalTranscriptBackend):
    """Deterministic backend enabled explicitly for tests and API development."""

    def transcribe_file(
        self, audio_path: Path, *, meeting_id: str, language: str
    ) -> list[TranscriptSegment]:
        if not audio_path.is_file():
            raise RuntimeError("Temporary input is unavailable")
        return [
            TranscriptSegment("Hello everyone, let's begin.", 0.0, 3.2),
            TranscriptSegment("This is the final test transcript.", 3.2, 6.0),
        ]


class FasterWhisperFinalTranscriptBackend(FinalTranscriptBackend):
    def __init__(self, model_name: str):
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper is not installed; install the server asr optional dependency"
            ) from exc
        self._model = WhisperModel(model_name)

    def transcribe_file(
        self, audio_path: Path, *, meeting_id: str, language: str
    ) -> list[TranscriptSegment]:
        segments, _ = self._model.transcribe(
            str(audio_path), language=language, task="transcribe", vad_filter=True
        )
        return [
            TranscriptSegment(
                text=segment.text.strip(),
                start=float(segment.start),
                end=float(segment.end),
                confidence=None,
            )
            for segment in segments
            if segment.text.strip()
        ]


def create_final_transcript_backend(settings: Settings) -> FinalTranscriptBackend:
    if settings.final_fake_asr:
        return FakeFinalTranscriptBackend()
    if settings.default_final_engine == "faster-whisper":
        return FasterWhisperFinalTranscriptBackend(settings.default_final_model)
    raise RuntimeError("Unsupported final ASR engine")
