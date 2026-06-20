from app.live.events import live_transcript_event


def test_live_transcript_event_uses_normalized_partial_shape() -> None:
    transcript = live_transcript_event(
        session_id="srv_live_abc",
        turn_id="turn_001",
        speaker="SPEAKER_01",
        start=12.4,
        end=15.2,
        text="I think we should",
        is_final=False,
    )

    assert transcript == {
        "type": "partial",
        "sessionId": "srv_live_abc",
        "turnId": "turn_001",
        "speaker": "SPEAKER_01",
        "start": 12.4,
        "end": 15.2,
        "text": "I think we should",
        "source": "live",
        "isFinal": False,
    }


def test_live_transcript_event_uses_normalized_final_shape() -> None:
    transcript = live_transcript_event(
        session_id="srv_live_abc",
        turn_id="turn_001",
        speaker="SPEAKER_01",
        start=12.4,
        end=18.9,
        text="I think we should prioritize English live meetings first.",
        is_final=True,
    )

    assert transcript["type"] == "turn_final"
    assert transcript["isFinal"] is True
    assert transcript["source"] == "live"
