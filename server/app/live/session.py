from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.live.asr import AsrResult, LiveAsrBackend
from app.live.audio_buffer import PcmAudioBuffer
from app.live.events import event


class LiveSessionRegistry:
    def __init__(self):
        self._active: set[str] = set()
        self._lock = asyncio.Lock()

    async def acquire(self, session_id: str, maximum: int) -> bool:
        async with self._lock:
            if session_id in self._active or len(self._active) >= maximum:
                return False
            self._active.add(session_id)
            return True

    async def release(self, session_id: str) -> None:
        async with self._lock:
            self._active.discard(session_id)


registry = LiveSessionRegistry()


@dataclass
class SpeakerTurnBuilder:
    session_id: str
    turn_number: int = 1
    elapsed_seconds: float = 0.0
    current_start: float | None = None

    def build(self, result: AsrResult, chunk_duration: float) -> dict[str, object]:
        turn_id = f"turn_{self.turn_number:03d}"
        result_start = self.elapsed_seconds + result.start
        if self.current_start is None:
            self.current_start = result_start
        end = self.elapsed_seconds + result.end
        transcript = event(
            "turn_final" if result.is_final else "partial",
            self.session_id,
            turnId=turn_id,
            speaker="SPEAKER_01",
            start=round(self.current_start, 3),
            end=round(end, 3),
            text=result.text,
            source="live",
            isFinal=result.is_final,
        )
        if result.is_final:
            self.turn_number += 1
            self.current_start = None
        return transcript

    def advance(self, duration: float) -> None:
        self.elapsed_seconds += duration


class LiveSession:
    def __init__(self, session_id: str, backend: LiveAsrBackend, buffer_seconds: int):
        self.session_id = session_id
        self.backend = backend
        self.buffer = PcmAudioBuffer(buffer_seconds)
        self.turns = SpeakerTurnBuilder(session_id)

    async def process(self, chunk: bytes) -> list[dict[str, object]]:
        self.buffer.append(chunk)
        duration = len(chunk) / PcmAudioBuffer.BYTES_PER_SECOND
        results = await self.backend.transcribe_chunk(chunk, session_id=self.session_id)
        events = [self.turns.build(result, duration) for result in results]
        self.turns.advance(duration)
        return events

    async def close(self) -> None:
        self.buffer.clear()
        await self.backend.close()
