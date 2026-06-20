from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.routes.admin import get_workspace_manager
from app.storage import TempWorkspaceManager
from tests.conftest import TEST_API_KEY


@pytest.fixture
def admin_client(tmp_path: Path) -> tuple[TestClient, TempWorkspaceManager]:
    settings = Settings(server_api_key=TEST_API_KEY, asr_tmp_dir=tmp_path / "managed")
    manager = TempWorkspaceManager(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_workspace_manager] = lambda: manager
    with TestClient(app) as client:
        yield client, manager
    app.dependency_overrides.clear()


@pytest.mark.parametrize("path", ["/admin/storage", "/admin/cleanup"])
def test_admin_endpoints_require_auth(admin_client: tuple[TestClient, TempWorkspaceManager], path: str) -> None:
    client, _ = admin_client
    method = client.get if path.endswith("storage") else client.post

    assert method(path).status_code == 401
    assert method(path, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert method(f"{path}?apiKey={TEST_API_KEY}").status_code == 401


def test_storage_endpoint_works_with_valid_token(
    admin_client: tuple[TestClient, TempWorkspaceManager],
) -> None:
    client, manager = admin_client
    manager.create_session_workspace("session")

    response = client.get(
        "/admin/storage", headers={"Authorization": f"Bearer {TEST_API_KEY}"}
    )

    assert response.status_code == 200
    assert response.json()["storageMode"] == "ephemeral"
    assert response.json()["counts"] == {"sessions": 1, "jobs": 0}


def test_cleanup_endpoint_works_with_valid_token(
    admin_client: tuple[TestClient, TempWorkspaceManager],
) -> None:
    client, manager = admin_client
    orphan = manager.jobs_root / "orphan"
    orphan.mkdir()

    response = client.post(
        "/admin/cleanup", headers={"Authorization": f"Bearer {TEST_API_KEY}"}
    )

    assert response.status_code == 200
    assert response.json() == {"deleted": 1, "freedBytes": 0, "errors": []}
