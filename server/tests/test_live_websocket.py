import pytest
from starlette.websockets import WebSocketDisconnect

from tests.conftest import TEST_API_KEY

SESSION_PATH = "/live/sessions/srv_live_abc/stream"


def authenticate(websocket, **details) -> dict:
    websocket.send_json({"type": "auth", "apiKey": TEST_API_KEY, **details})
    return websocket.receive_json()


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


def test_api_key_query_parameter_is_rejected(client) -> None:
    with client.websocket_connect(f"{SESSION_PATH}?apiKey={TEST_API_KEY}") as websocket:
        assert_unauthorized(websocket)


def test_vietnamese_live_mode_is_not_exposed(client) -> None:
    with client.websocket_connect(SESSION_PATH) as websocket:
        websocket.send_json({"type": "auth", "apiKey": TEST_API_KEY, "language": "vi"})
        assert websocket.receive_json() == {
            "type": "error",
            "code": "UNSUPPORTED_LANGUAGE",
            "message": "English is the only live language.",
            "sessionId": "srv_live_abc",
        }
        with pytest.raises(WebSocketDisconnect) as closed:
            websocket.receive_json()
        assert closed.value.code == 1008


def test_fake_asr_emits_partial_final_stable_turns_and_clean_close(client) -> None:
    with client.websocket_connect(SESSION_PATH) as websocket:
        assert authenticate(websocket) == {
            "type": "session_started",
            "sessionId": "srv_live_abc",
            "language": "en",
        }

        websocket.send_bytes(b"\x00\x00" * 160)
        partial = websocket.receive_json()
        assert partial == {
            "type": "partial",
            "sessionId": "srv_live_abc",
            "turnId": "turn_001",
            "speaker": "SPEAKER_01",
            "start": 0.0,
            "end": 0.01,
            "text": "Test partial transcript",
            "source": "live",
            "isFinal": False,
        }

        websocket.send_bytes(b"\x00\x00" * 160)
        final = websocket.receive_json()
        assert final["type"] == "turn_final"
        assert final["turnId"] == "turn_001"
        assert final["speaker"] == "SPEAKER_01"
        assert final["isFinal"] is True

        websocket.send_bytes(b"\x00\x00" * 160)
        assert websocket.receive_json()["turnId"] == "turn_002"

        websocket.send_json({"type": "close"})
        assert websocket.receive_json() == {
            "type": "session_closed",
            "sessionId": "srv_live_abc",
        }


def test_invalid_pcm_is_rejected_without_closing_session(client) -> None:
    with client.websocket_connect(SESSION_PATH) as websocket:
        authenticate(websocket)
        websocket.send_bytes(b"odd")
        error = websocket.receive_json()
        assert error["type"] == "error"
        assert error["code"] == "INVALID_AUDIO"
        websocket.send_json({"type": "close"})
        assert websocket.receive_json()["type"] == "session_closed"


def test_max_concurrent_sessions_guard(client) -> None:
    with client.websocket_connect(SESSION_PATH) as first:
        authenticate(first)
        with client.websocket_connect("/live/sessions/second/stream") as second:
            error = authenticate(second)
            assert error["code"] == "LIVE_SESSION_LIMIT"
            with pytest.raises(WebSocketDisconnect) as closed:
                second.receive_json()
            assert closed.value.code == 1008
        first.send_json({"type": "close"})
        first.receive_json()


def test_session_buffer_is_cleared_without_persistence(client, monkeypatch, tmp_path) -> None:
    from app.live.audio_buffer import PcmAudioBuffer

    cleared_sizes = []
    original_clear = PcmAudioBuffer.clear

    def observed_clear(buffer):
        original_clear(buffer)
        cleared_sizes.append(buffer.size)

    monkeypatch.setattr(PcmAudioBuffer, "clear", observed_clear)
    with client.websocket_connect(SESSION_PATH) as websocket:
        authenticate(websocket)
        websocket.send_bytes(b"\x00\x00" * 160)
        websocket.receive_json()
        websocket.send_json({"type": "close"})
        websocket.receive_json()
    assert cleared_sizes == [0]
    assert not (tmp_path / "asr-gateway-tests").exists()
