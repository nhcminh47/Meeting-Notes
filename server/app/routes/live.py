from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket

from app.config import Settings, get_settings
from app.live.websocket import handle_pcm_stream

router = APIRouter(prefix="/live", tags=["live"])


@router.websocket("/sessions/{session_id}/stream")
async def live_pcm_stream(
    websocket: WebSocket,
    session_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    await handle_pcm_stream(websocket, session_id, settings)
