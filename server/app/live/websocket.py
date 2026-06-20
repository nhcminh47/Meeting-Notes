import json
import secrets

from fastapi import WebSocket, WebSocketDisconnect

from app.live.events import event, unauthorized_event

POLICY_VIOLATION = 1008
NORMAL_CLOSURE = 1000


async def _reject_unauthorized(websocket: WebSocket) -> None:
    await websocket.send_json(unauthorized_event())
    await websocket.close(code=POLICY_VIOLATION)


def _valid_auth_message(message: dict[str, object], api_key: str) -> bool:
    supplied_key = message.get("apiKey")
    return (
        message.get("type") == "auth"
        and isinstance(supplied_key, str)
        and bool(supplied_key)
        and secrets.compare_digest(supplied_key, api_key)
    )


async def handle_pcm_stream(websocket: WebSocket, session_id: str, api_key: str) -> None:
    await websocket.accept()

    # Query-string credentials are forbidden even if the client also sends valid first-message auth.
    if "apiKey" in websocket.query_params or "api_key" in websocket.query_params:
        await _reject_unauthorized(websocket)
        return

    try:
        first_message = await websocket.receive()
        if first_message.get("type") == "websocket.disconnect":
            return

        auth_text = first_message.get("text")
        if not isinstance(auth_text, str):
            await _reject_unauthorized(websocket)
            return

        try:
            auth_message = json.loads(auth_text)
        except (json.JSONDecodeError, TypeError):
            await _reject_unauthorized(websocket)
            return

        if not isinstance(auth_message, dict) or not _valid_auth_message(auth_message, api_key):
            await _reject_unauthorized(websocket)
            return

        received_chunks = 0
        received_bytes = 0
        await websocket.send_json(event("session_started", session_id))

        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                return

            chunk = message.get("bytes")
            if isinstance(chunk, bytes):
                received_chunks += 1
                received_bytes += len(chunk)
                await websocket.send_json(
                    event(
                        "transport_probe",
                        session_id,
                        receivedChunks=received_chunks,
                        receivedBytes=received_bytes,
                        message="Audio chunk received",
                    )
                )
                continue

            text = message.get("text")
            if isinstance(text, str):
                try:
                    control = json.loads(text)
                except json.JSONDecodeError:
                    control = None
                if isinstance(control, dict) and control.get("type") == "close":
                    await websocket.send_json(
                        event(
                            "session_closed",
                            session_id,
                            receivedChunks=received_chunks,
                            receivedBytes=received_bytes,
                        )
                    )
                    await websocket.close(code=NORMAL_CLOSURE)
                    return

                await websocket.send_json(
                    event(
                        "error",
                        session_id,
                        code="INVALID_MESSAGE",
                        message="Expected a binary audio chunk or close message.",
                    )
                )
    except WebSocketDisconnect:
        return
