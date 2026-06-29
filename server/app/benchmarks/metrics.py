from __future__ import annotations

from dataclasses import dataclass, field


def percentile(values: list[float], percentile_value: float) -> float | None:
    if not values:
        return None
    if percentile_value < 0 or percentile_value > 100:
        raise ValueError("percentile must be between 0 and 100")

    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]

    rank = (len(ordered) - 1) * (percentile_value / 100)
    lower = int(rank)
    upper = min(lower + 1, len(ordered) - 1)
    weight = rank - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def word_error_rate(reference: str, hypothesis: str) -> float | None:
    reference_words = reference.lower().split()
    hypothesis_words = hypothesis.lower().split()
    if not reference_words:
        return None

    rows = len(reference_words) + 1
    cols = len(hypothesis_words) + 1
    distances = [[0] * cols for _ in range(rows)]
    for row in range(rows):
        distances[row][0] = row
    for col in range(cols):
        distances[0][col] = col

    for row in range(1, rows):
        for col in range(1, cols):
            cost = 0 if reference_words[row - 1] == hypothesis_words[col - 1] else 1
            distances[row][col] = min(
                distances[row - 1][col] + 1,
                distances[row][col - 1] + 1,
                distances[row - 1][col - 1] + cost,
            )

    return distances[-1][-1] / len(reference_words)


@dataclass
class LiveBenchmarkMetrics:
    audio_duration_seconds: float
    chunk_processing_ms: list[float] = field(default_factory=list)
    time_to_first_partial_ms: float | None = None
    time_to_first_final_ms: float | None = None
    chunks: int = 0
    final_turns: int = 0
    partial_events: int = 0
    errors: int = 0

    def to_json(self, total_processing_ms: float, wer: float | None = None) -> dict[str, object]:
        result: dict[str, object] = {
            "timeToFirstPartialMs": _round_optional(self.time_to_first_partial_ms),
            "timeToFirstFinalMs": _round_optional(self.time_to_first_final_ms),
            "averageChunkProcessingMs": _round_optional(_average(self.chunk_processing_ms)),
            "p50ChunkProcessingMs": _round_optional(percentile(self.chunk_processing_ms, 50)),
            "p95ChunkProcessingMs": _round_optional(percentile(self.chunk_processing_ms, 95)),
            "totalProcessingMs": round(total_processing_ms, 3),
            "realTimeFactor": calculate_real_time_factor(
                total_processing_ms, self.audio_duration_seconds
            ),
            "chunks": self.chunks,
            "finalTurns": self.final_turns,
            "partialEvents": self.partial_events,
            "errors": self.errors,
        }
        if wer is not None:
            result["wordErrorRate"] = round(wer, 4)
        return result


def calculate_real_time_factor(total_processing_ms: float, audio_duration_seconds: float) -> float | None:
    if audio_duration_seconds <= 0:
        return None
    return round(total_processing_ms / (audio_duration_seconds * 1000), 4)


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _round_optional(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 3)
