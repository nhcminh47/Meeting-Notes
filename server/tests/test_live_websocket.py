import pytest
from starlette.websockets import WebSocketDisconnect

from tests.conftest import TEST_API_KEY

SESSION_PATH = "/live/sessions/live_probe_001/stream"


def assert_unauthorized(websocket) -> None:
    assert websocket.receive_json() == {
        "type": "error",
        "code": "UNAUTHORIZED",
        "message": "Missing or invalid API key.",
    }
    with pytest.raises(WebSocketDisconnect) as closed:
        websocket.receive_json()
    assert closed.value.code == 1008


def test_unauthenticated_websocket_is_rejected(client) -> None:
    with client.websocket_connect(SESSION_PATH) as websocket:
        websocket.send_bytes(b"not-auth")
        assert_unauthorized(websocket)


def test_wrong_api_key_is_rejected(client) -> None:
    with client.websocket_connect(SESSION_PATH) as websocket:
        websocket.send_json({"type": "auth", "apiKey": "wrong-key"})
        assert_unauthorized(websocket)


def test_valid_stream_counts_chunks_and_closes_cleanly(client) -> None:
    with client.websocket_connect(SESSION_PATH) as websocket:
        websocket.send_json({"type": "auth", "apiKey": TEST_API_KEY})
        assert websocket.receive_json() == {
            "type": "session_started",
            "sessionId": "live_probe_001",
        }

        websocket.send_bytes(b"1234")
        assert websocket.receive_json() == {
            "type": "transport_probe",
            "sessionId": "live_probe_001",
            "receivedChunks": 1,
            "receivedBytes": 4,
            "message": "Audio chunk received",
        }

        websocket.send_bytes(b"567")
        probe = websocket.receive_json()
        assert probe["receivedChunks"] == 2
        assert probe["receivedBytes"] == 7

        websocket.send_json({"type": "close"})
        assert websocket.receive_json() == {
            "type": "session_closed",
            "sessionId": "live_probe_001",
            "receivedChunks": 2,
            "receivedBytes": 7,
        }


def test_api_key_query_parameter_is_rejected(client) -> None:
    with client.websocket_connect(f"{SESSION_PATH}?apiKey={TEST_API_KEY}") as websocket:
        assert_unauthorized(websocket)
