import asyncio
import json
import secrets

from fastapi import WebSocket, WebSocketDisconnect

from app.config import Settings
from app.live.asr import create_live_asr_backend
from app.live.events import error_event, event, unauthorized_event
from app.live.session import LiveSession, registry

POLICY_VIOLATION = 1008
NORMAL_CLOSURE = 1000
INTERNAL_ERROR = 1011


async def _reject_unauthorized(websocket: WebSocket) -> None:
    await websocket.send_json(unauthorized_event())
    await websocket.close(code=POLICY_VIOLATION)


def _valid_auth_message(message: dict[str, object], settings: Settings) -> bool:
    supplied_key = message.get("apiKey")
    return (
        message.get("type") == "auth"
        and isinstance(supplied_key, str)
        and bool(supplied_key)
        and secrets.compare_digest(supplied_key, settings.server_api_key)
    )


async def handle_pcm_stream(websocket: WebSocket, session_id: str, settings: Settings) -> None:
    await websocket.accept()
    if "apiKey" in websocket.query_params or "api_key" in websocket.query_params:
        await _reject_unauthorized(websocket)
        return

    session: LiveSession | None = None
    acquired = False
    try:
        first_message = await websocket.receive()
        if first_message.get("type") == "websocket.disconnect":
            return
        auth_text = first_message.get("text")
        try:
            auth_message = json.loads(auth_text) if isinstance(auth_text, str) else None
        except json.JSONDecodeError:
            auth_message = None
        if not isinstance(auth_message, dict) or not _valid_auth_message(auth_message, settings):
            await _reject_unauthorized(websocket)
            return
        if auth_message.get("language", "en") != "en":
            await websocket.send_json(
                error_event("UNSUPPORTED_LANGUAGE", "English is the only live language.", session_id)
            )
            await websocket.close(code=POLICY_VIOLATION)
            return

        acquired = await registry.acquire(session_id, settings.max_concurrent_live_sessions)
        if not acquired:
            await websocket.send_json(error_event("LIVE_SESSION_LIMIT", "No live session capacity.", session_id))
            await websocket.close(code=POLICY_VIOLATION)
            return
        try:
            backend = await asyncio.to_thread(create_live_asr_backend, settings)
        except RuntimeError:
            await websocket.send_json(error_event("ASR_UNAVAILABLE", "Live ASR is unavailable.", session_id))
            await websocket.close(code=INTERNAL_ERROR)
            return
        session = LiveSession(session_id, backend, settings.live_audio_buffer_seconds)
        await websocket.send_json(event("session_started", session_id, language="en"))

        deadline = asyncio.get_running_loop().time() + settings.live_session_ttl_minutes * 60
        while True:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise TimeoutError
            message = await asyncio.wait_for(websocket.receive(), timeout=remaining)
            if message.get("type") == "websocket.disconnect":
                return
            chunk = message.get("bytes")
            if isinstance(chunk, bytes):
                try:
                    for transcript_event in await session.process(chunk):
                        await websocket.send_json(transcript_event)
                except ValueError as exc:
                    await websocket.send_json(error_event("INVALID_AUDIO", str(exc), session_id))
                continue
            text = message.get("text")
            try:
                control = json.loads(text) if isinstance(text, str) else None
            except json.JSONDecodeError:
                control = None
            if isinstance(control, dict) and control.get("type") == "close":
                await websocket.send_json(event("session_closed", session_id))
                await websocket.close(code=NORMAL_CLOSURE)
                return
            await websocket.send_json(error_event(
                "INVALID_MESSAGE", "Expected a binary audio chunk or close message.", session_id
            ))
    except TimeoutError:
        await websocket.send_json(error_event("SESSION_TTL_EXPIRED", "Live session expired.", session_id))
        await websocket.close(code=NORMAL_CLOSURE)
    except WebSocketDisconnect:
        return
    except Exception:
        try:
            await websocket.send_json(error_event("ASR_ERROR", "Live transcription failed.", session_id))
            await websocket.close(code=INTERNAL_ERROR)
        except RuntimeError:
            pass
    finally:
        if session is not None:
            await session.close()
        if acquired:
            await registry.release(session_id)
