from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import Protected
from app.config import Settings, get_settings

router = APIRouter(tags=["engines"])


class Engine(BaseModel):
    id: str
    type: Literal["live", "final"]
    status: Literal["placeholder"] = "placeholder"


class EnginesResponse(BaseModel):
    engines: list[Engine]


@router.get("/engines", response_model=EnginesResponse)
def engines(
    _authorized: Protected,
    settings: Annotated[Settings, Depends(get_settings)],
) -> EnginesResponse:
    return EnginesResponse(
        engines=[
            Engine(id=settings.default_live_engine, type="live"),
            Engine(id=settings.default_final_engine, type="final"),
        ]
    )
