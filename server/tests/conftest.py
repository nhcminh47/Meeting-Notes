import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app

TEST_API_KEY = "unit-test-placeholder-key"


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_settings] = lambda: Settings(server_api_key=TEST_API_KEY)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
