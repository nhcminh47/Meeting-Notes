from __future__ import annotations

import math

from app.jobs.diarization import SpeakerSegment
from app.jobs.final_transcript import TranscriptSegment


def validate_speaker_segments(segments: object) -> list[SpeakerSegment] | None:
    if not isinstance(segments, list):
        return None
    validated: list[SpeakerSegment] = []
    for segment in segments:
        if (
            not isinstance(segment, SpeakerSegment)
            or not isinstance(segment.speaker_id, str)
            or not segment.speaker_id.strip()
            or isinstance(segment.start, bool)
            or isinstance(segment.end, bool)
            or not isinstance(segment.start, (int, float))
            or not isinstance(segment.end, (int, float))
            or not math.isfinite(segment.start)
            or not math.isfinite(segment.end)
            or segment.start < 0
            or segment.end < segment.start
        ):
            return None
        validated.append(segment)
    return validated


def map_speakers_by_overlap(
    transcript_segments: list[TranscriptSegment],
    speaker_segments: list[SpeakerSegment],
) -> list[str]:
    """Map by maximum overlap and normalize labels by first output appearance."""
    diarization = sorted(
        speaker_segments, key=lambda segment: (segment.start, segment.end, segment.speaker_id)
    )
    normalized: dict[str, str] = {}
    output: list[str] = []

    for transcript in transcript_segments:
        best: SpeakerSegment | None = None
        best_overlap = 0.0
        for speaker in diarization:
            overlap = max(0.0, min(transcript.end, speaker.end) - max(transcript.start, speaker.start))
            if overlap > best_overlap:
                best = speaker
                best_overlap = overlap
        if best is None:
            output.append("UNKNOWN")
            continue
        if best.speaker_id not in normalized:
            normalized[best.speaker_id] = f"SPEAKER_{len(normalized) + 1:02d}"
        output.append(normalized[best.speaker_id])

    return output
