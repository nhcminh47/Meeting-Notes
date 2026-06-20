import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app

TEST_API_KEY = "unit-test-placeholder-key"


@pytest.fixture
def client(tmp_path) -> TestClient:
    settings = Settings(
        server_api_key=TEST_API_KEY,
        live_fake_asr=True,
        final_fake_asr=True,
        asr_tmp_dir=tmp_path / "asr-gateway-tests",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    app.state.test_settings = settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
