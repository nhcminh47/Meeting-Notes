from fastapi.testclient import TestClient


def test_public_health_is_available_without_auth(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "asr-gateway"}


def test_public_health_does_not_expose_sensitive_configuration(client: TestClient) -> None:
    body = client.get("/health").text

    assert "api" not in body.lower()
    assert "model" not in body.lower()
    assert "storage" not in body.lower()
    assert "gpu" not in body.lower()
    assert "unit-test-placeholder-key" not in body
