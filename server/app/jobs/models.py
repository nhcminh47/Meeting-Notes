from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

JobStatus = Literal["queued", "running", "completed", "failed", "cancelled", "expired"]


@dataclass(frozen=True)
class TranscriptTurn:
    id: str
    meetingId: str
    speakerId: str
    speakerName: None
    start: float
    end: float
    text: str
    language: str
    source: Literal["final"] = "final"
    isFinal: bool = True
    confidence: float | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class FinalTranscriptResult:
    schemaVersion: int
    jobId: str
    meetingId: str
    language: str
    generatedAt: str
    turns: list[TranscriptTurn]

    def to_dict(self) -> dict[str, object]:
        value = asdict(self)
        value["turns"] = [turn.to_dict() for turn in self.turns]
        return value
