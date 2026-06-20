import pytest
from fastapi.testclient import TestClient

from tests.conftest import TEST_API_KEY


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/jobs/finalize"),
        ("get", "/jobs/job_missing"),
        ("get", "/jobs/job_missing/result"),
        ("post", "/jobs/job_missing/cancel"),
    ],
)
def test_all_final_job_endpoints_require_auth(
    client: TestClient, method: str, path: str
) -> None:
    response = client.request(method, path)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_final_job_api_key_in_query_string_is_rejected(client: TestClient) -> None:
    response = client.post(
        f"/jobs/finalize?apiKey={TEST_API_KEY}", files={"file": ("audio.wav", b"audio")}
    )

    assert response.status_code == 401
    assert TEST_API_KEY not in response.text
