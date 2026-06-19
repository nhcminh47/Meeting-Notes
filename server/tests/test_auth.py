import pytest
from fastapi.testclient import TestClient

from tests.conftest import TEST_API_KEY


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer wrong-token"},
        {"Authorization": f"Basic {TEST_API_KEY}"},
    ],
)
def test_protected_endpoint_rejects_invalid_auth(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.get("/engines", headers=headers)

    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Missing or invalid API key.",
        }
    }


@pytest.mark.parametrize("path", ["/health/private", "/engines", "/models"])
def test_protected_endpoints_accept_valid_bearer_token(
    client: TestClient, path: str
) -> None:
    response = client.get(path, headers={"Authorization": f"Bearer {TEST_API_KEY}"})

    assert response.status_code == 200


def test_api_key_in_query_string_is_not_accepted(client: TestClient) -> None:
    response = client.get(f"/models?apiKey={TEST_API_KEY}")

    assert response.status_code == 401


def test_authorization_value_is_not_logged(client: TestClient, caplog) -> None:
    client.get("/models", headers={"Authorization": f"Bearer {TEST_API_KEY}"})

    assert TEST_API_KEY not in caplog.text
