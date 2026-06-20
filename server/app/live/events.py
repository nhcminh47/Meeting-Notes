from typing import Any


def event(event_type: str, session_id: str, **details: Any) -> dict[str, Any]:
    return {"type": event_type, "sessionId": session_id, **details}


def unauthorized_event() -> dict[str, str]:
    return {
        "type": "error",
        "code": "UNAUTHORIZED",
        "message": "Missing or invalid API key.",
    }
