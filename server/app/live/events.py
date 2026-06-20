from typing import Any


def event(event_type: str, session_id: str, **details: Any) -> dict[str, Any]:
    return {"type": event_type, "sessionId": session_id, **details}


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
