from collections import deque


class PcmAudioBuffer:
    """Bounded, memory-only buffer for 16 kHz mono signed 16-bit PCM."""

    BYTES_PER_SECOND = 16_000 * 2

    def __init__(self, retention_seconds: int):
        self.max_bytes = retention_seconds * self.BYTES_PER_SECOND
        self._chunks: deque[bytes] = deque()
        self._size = 0

    def append(self, chunk: bytes) -> None:
        if not chunk or len(chunk) % 2:
            raise ValueError("Audio chunks must contain complete 16-bit PCM samples.")
        if len(chunk) > self.max_bytes:
            raise ValueError("Audio chunk exceeds the configured live buffer capacity.")
        self._chunks.append(chunk)
        self._size += len(chunk)
        while self._size > self.max_bytes and self._chunks:
            self._size -= len(self._chunks.popleft())

    @property
    def size(self) -> int:
        return self._size

    def clear(self) -> None:
        self._chunks.clear()
        self._size = 0
