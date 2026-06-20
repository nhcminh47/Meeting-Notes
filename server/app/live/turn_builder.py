from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.live.events import live_transcript_event


class LiveAsrSegment(Protocol):
    """Backend-neutral input accepted by the speaker turn builder."""

    text: str
    start: float
    end: float
    is_final: bool


@dataclass
class SpeakerTurnBuilder:
    """Convert ordered ASR segments into normalized live transcript events.

    V1 commits each final ASR segment as one turn. Partial hypotheses reuse the
    current turn ID and do not advance the committed turn counter.
    """

    session_id: str
    speaker: str = "SPEAKER_01"
    turn_number: int = 1
    elapsed_seconds: float = 0.0
    current_start: float | None = None

    def build(self, segment: LiveAsrSegment) -> dict[str, object] | None:
        text = segment.text.strip()
        if not text:
            return None

        turn_id = f"turn_{self.turn_number:03d}"
        segment_start = self.elapsed_seconds + segment.start
        if self.current_start is None:
            self.current_start = segment_start

        transcript = live_transcript_event(
            session_id=self.session_id,
            turn_id=turn_id,
            speaker=self.speaker,
            start=self.current_start,
            end=self.elapsed_seconds + segment.end,
            text=text,
            is_final=segment.is_final,
        )
        if segment.is_final:
            self.turn_number += 1
            self.current_start = None
        return transcript

    def advance(self, duration: float) -> None:
        self.elapsed_seconds += duration
