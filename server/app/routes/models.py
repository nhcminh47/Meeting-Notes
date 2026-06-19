from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import Protected
from app.config import Settings, get_settings
from app.schemas.health import ModelConfiguration

router = APIRouter(tags=["models"])


@router.get("/models", response_model=dict[str, ModelConfiguration])
def models(
    _authorized: Protected,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, ModelConfiguration]:
    return {
        "models": ModelConfiguration(
            live=settings.default_live_model,
            final=settings.default_final_model,
        )
    }
