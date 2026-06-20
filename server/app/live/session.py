from __future__ import annotations

import asyncio

from app.live.asr import LiveAsrBackend
from app.live.audio_buffer import PcmAudioBuffer
from app.live.turn_builder import SpeakerTurnBuilder


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
        events = [transcript for result in results if (transcript := self.turns.build(result))]
        self.turns.advance(duration)
        return events

    async def close(self) -> None:
        self.buffer.clear()
        await self.backend.close()
