from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import Protected
from app.config import Settings, get_settings
from app.schemas.health import GpuStatus, ModelConfiguration, PrivateHealth, PublicHealth

router = APIRouter(tags=["health"])


@router.get("/health", response_model=PublicHealth)
def public_health() -> PublicHealth:
    return PublicHealth(status="ok", service="asr-gateway")


@router.get("/health/private", response_model=PrivateHealth)
def private_health(
    _authorized: Protected,
    settings: Annotated[Settings, Depends(get_settings)],
) -> PrivateHealth:
    return PrivateHealth(
        status="ok",
        service="asr-gateway",
        storageMode=settings.server_storage_mode,
        gpu=GpuStatus(available=False, name=None),
        models=ModelConfiguration(
            live=settings.default_live_model,
            final=settings.default_final_model,
        ),
    )
