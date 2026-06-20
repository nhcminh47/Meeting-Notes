from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import Protected
from app.config import Settings, get_settings
from app.schemas.storage import CleanupSummary, StorageSummary
from app.storage import TempWorkspaceManager

router = APIRouter(prefix="/admin", tags=["admin"])


def get_workspace_manager(settings: Annotated[Settings, Depends(get_settings)]) -> TempWorkspaceManager:
    return TempWorkspaceManager(settings)


Manager = Annotated[TempWorkspaceManager, Depends(get_workspace_manager)]


@router.get("/storage", response_model=StorageSummary)
def storage_summary(_: Protected, manager: Manager) -> dict[str, object]:
    return manager.get_storage_summary()


@router.post("/cleanup", response_model=CleanupSummary)
def cleanup(_: Protected, manager: Manager) -> dict[str, object]:
    result = manager.cleanup_expired()
    return {"deleted": result.deleted, "freedBytes": result.freed_bytes, "errors": result.errors}
