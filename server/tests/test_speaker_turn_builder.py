from app.live.asr import AsrResult
from app.live.turn_builder import SpeakerTurnBuilder


def segment(text: str, *, start: float = 1.25, end: float = 2.5, final: bool = True) -> AsrResult:
    return AsrResult(text, start, end, final)


def test_first_and_next_final_segments_get_incremental_turn_ids() -> None:
    builder = SpeakerTurnBuilder("srv_live_abc")

    first = builder.build(segment("First spoken turn."))
    second = builder.build(segment("Second spoken turn.", start=2.75, end=3.5))

    assert first == {
        "type": "turn_final",
        "sessionId": "srv_live_abc",
        "turnId": "turn_001",
        "speaker": "SPEAKER_01",
        "start": 1.25,
        "end": 2.5,
        "text": "First spoken turn.",
        "source": "live",
        "isFinal": True,
    }
    assert second is not None
    assert second["turnId"] == "turn_002"


def test_partial_reuses_current_turn_without_advancing_counter() -> None:
    builder = SpeakerTurnBuilder("srv_live_abc")

    partial = builder.build(segment("Interim words", final=False))
    revised_partial = builder.build(segment("Interim words revised", end=2.75, final=False))
    final = builder.build(segment("Committed words", end=3.0))
    next_final = builder.build(segment("Next turn", start=3.25, end=4.0))

    assert partial is not None
    assert partial["type"] == "partial"
    assert partial["turnId"] == "turn_001"
    assert partial["isFinal"] is False
    assert revised_partial is not None
    assert revised_partial["turnId"] == "turn_001"
    assert final is not None
    assert final["turnId"] == "turn_001"
    assert final["start"] == 1.25
    assert next_final is not None
    assert next_final["turnId"] == "turn_002"


def test_empty_and_whitespace_segments_are_ignored_without_advancing_turn() -> None:
    builder = SpeakerTurnBuilder("srv_live_abc")

    assert builder.build(segment("")) is None
    assert builder.build(segment("  \n\t  ", final=False)) is None
    committed = builder.build(segment("  Dialogue, not a bullet or summary.  "))

    assert committed is not None
    assert committed["turnId"] == "turn_001"
    assert committed["text"] == "Dialogue, not a bullet or summary."


def test_offsets_advance_with_audio_chunks() -> None:
    builder = SpeakerTurnBuilder("srv_live_abc")
    builder.advance(0.5)

    committed = builder.build(segment("Later dialogue.", start=0.1, end=0.4))

    assert committed is not None
    assert committed["start"] == 0.6
    assert committed["end"] == 0.9
