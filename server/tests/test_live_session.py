import asyncio

from app.live.asr import AsrResult, LiveAsrBackend
from app.live.audio_buffer import PcmAudioBuffer
from app.live.session import LiveSession


class RecordingAsr(LiveAsrBackend):
    def __init__(self):
        self.audio = b""

    async def transcribe_chunk(self, audio: bytes, *, session_id: str):
        self.audio = audio
        return [AsrResult("Dialogue, not a bullet", 0.0, 0.1, True)]


def test_audio_buffer_is_bounded_and_memory_only() -> None:
    buffer = PcmAudioBuffer(1)
    buffer.append(b"\x00\x00" * 16_000)
    buffer.append(b"\x01\x00" * 8_000)
    assert buffer.size <= PcmAudioBuffer.BYTES_PER_SECOND


def test_live_session_passes_pcm_and_builds_dialogue_event() -> None:
    asyncio.run(_assert_live_session())


async def _assert_live_session() -> None:
    backend = RecordingAsr()
    session = LiveSession("live_test", backend, 1)
    pcm = b"\x00\x00" * 160
    events = await session.process(pcm)
    assert backend.audio == pcm
    assert events[0]["text"] == "Dialogue, not a bullet"
    assert events[0]["turnId"] == "turn_001"
    assert events[0]["type"] == "turn_final"
    await session.close()
    assert session.buffer.size == 0
