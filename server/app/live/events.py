from typing import Any


def event(event_type: str, session_id: str, **details: Any) -> dict[str, Any]:
    return {"type": event_type, "sessionId": session_id, **details}


def live_transcript_event(
    *,
    session_id: str,
    turn_id: str,
    speaker: str,
    start: float,
    end: float,
    text: str,
    is_final: bool,
) -> dict[str, object]:
    """Build the stable wire shape shared by partial and committed live turns."""
    return event(
        "turn_final" if is_final else "partial",
        session_id,
        turnId=turn_id,
        speaker=speaker,
        start=round(start, 3),
        end=round(end, 3),
        text=text,
        source="live",
        isFinal=is_final,
    )


def unauthorized_event() -> dict[str, str]:
    return {
        "type": "error",
        "code": "UNAUTHORIZED",
        "message": "Missing or invalid API key.",
    }


def error_event(code: str, message: str, session_id: str | None = None) -> dict[str, str]:
    result = {"type": "error", "code": code, "message": message}
    if session_id is not None:
        result["sessionId"] = session_id
    return result
