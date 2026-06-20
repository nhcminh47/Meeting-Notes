from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from app.config import Settings


@dataclass(frozen=True)
class SpeakerSegment:
    speaker_id: str
    start: float
    end: float


class DiarizationBackend(ABC):
    """Optional diarization plug-in. Implementations must not persist audio or results."""

    @property
    @abstractmethod
    def available(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    def diarize(self, audio_path: Path) -> list[SpeakerSegment]:
        raise NotImplementedError


class DisabledDiarizationBackend(DiarizationBackend):
    @property
    def available(self) -> bool:
        return False

    def diarize(self, audio_path: Path) -> list[SpeakerSegment]:
        return []


def create_diarization_backend(settings: Settings) -> DiarizationBackend:
    # This interface is the integration point for a future WhisperX/pyannote adapter.
    # Keep disabled as the only production backend until that dependency is packaged.
    return DisabledDiarizationBackend()
