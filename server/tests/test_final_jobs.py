from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.jobs.manager import FinalJobManager
from app.main import create_app
from tests.conftest import TEST_API_KEY

AUTH = {"Authorization": f"Bearer {TEST_API_KEY}"}


def submit(client: TestClient, **data: str):
    return client.post(
        "/jobs/finalize",
        headers=AUTH,
        data=data,
        files={"file": ("meeting.wav", b"temporary audio", "audio/wav")},
    )


def test_empty_upload_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/jobs/finalize", headers=AUTH, files={"file": ("empty.wav", b"", "audio/wav")}
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "EMPTY_UPLOAD"


def test_too_large_upload_is_rejected(tmp_path: Path) -> None:
    settings = Settings(
        server_api_key=TEST_API_KEY,
        final_fake_asr=True,
        max_upload_mb=1,
        asr_tmp_dir=tmp_path / "size-limit",
    )
    app: FastAPI = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as local_client:
        response = local_client.post(
            "/jobs/finalize",
            headers=AUTH,
            files={"file": ("large.wav", b"x" * (1024 * 1024 + 1), "audio/wav")},
        )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "UPLOAD_TOO_LARGE"
    assert list((settings.asr_tmp_dir / "jobs").iterdir()) == []


def test_completed_job_status_and_normalized_result(client: TestClient) -> None:
    created = submit(client, meetingId="mtg_test_001")

    assert created.status_code == 200
    assert created.json()["status"] == "completed"
    job_id = created.json()["jobId"]

    status = client.get(f"/jobs/{job_id}", headers=AUTH)
    result = client.get(f"/jobs/{job_id}/result", headers=AUTH)

    assert status.status_code == 200
    assert status.json()["status"] == "completed"
    assert status.json()["error"] is None
    assert result.status_code == 200
    body = result.json()
    assert body["schemaVersion"] == 1
    assert body["meetingId"] == "mtg_test_001"
    assert body["language"] == "en"
    assert body["diarizationStatus"] == "unavailable"
    assert [turn["id"] for turn in body["turns"]] == ["turn_001", "turn_002"]
    assert [turn["start"] for turn in body["turns"]] == sorted(
        turn["start"] for turn in body["turns"]
    )
    assert all(turn["speakerId"] == "SPEAKER_01" for turn in body["turns"])
    assert all(turn["speakerName"] is None for turn in body["turns"])
    assert all(turn["source"] == "final" for turn in body["turns"])
    assert all(turn["isFinal"] is True for turn in body["turns"])
    assert "summary" not in body
    assert "actionItems" not in body
    assert all(not turn["text"].lstrip().startswith(("-", "*")) for turn in body["turns"])


def test_input_and_result_cleanup_flags_are_respected(client: TestClient) -> None:
    created = submit(client)
    job_id = created.json()["jobId"]
    workspace = Path(client.app.state.test_settings.asr_tmp_dir) / "jobs" / job_id

    assert not list(workspace.glob("input.*"))
    assert (workspace / "result.json").is_file()

    assert client.get(f"/jobs/{job_id}/result", headers=AUTH).status_code == 200
    assert not (workspace / "result.json").exists()
    second = client.get(f"/jobs/{job_id}/result", headers=AUTH)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "JOB_NOT_READY"


def test_cleanup_can_be_disabled_explicitly(tmp_path: Path) -> None:
    manager = FinalJobManager(
        Settings(
            asr_tmp_dir=tmp_path / "retained-until-ttl",
            final_fake_asr=True,
            delete_input_after_job=False,
            delete_result_after_read=False,
        )
    )
    workspace = manager.storage.create_job_workspace("job_retain")
    input_path = workspace / "input.wav"
    input_path.write_bytes(b"audio")

    manager.create_and_run(
        input_path, job_id="job_retain", meeting_id="meeting", language="en"
    )
    manager.result("job_retain")

    assert input_path.is_file()
    assert (workspace / "result.json").is_file()


def test_transcript_text_is_not_logged(client: TestClient, caplog) -> None:
    created = submit(client)
    client.get(f"/jobs/{created.json()['jobId']}/result", headers=AUTH)

    assert "Hello everyone" not in caplog.text


def test_non_english_language_is_rejected(client: TestClient) -> None:
    response = submit(client, language="vi")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_LANGUAGE"


def test_job_not_found_is_safe(client: TestClient) -> None:
    response = client.get("/jobs/job_does_not_exist", headers=AUTH)

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "JOB_NOT_FOUND", "message": "Transcript job was not found."}
    }
    assert "\\" not in response.text


def test_cancel_marks_running_job_cleanup_eligible(tmp_path: Path) -> None:
    manager = FinalJobManager(
        Settings(asr_tmp_dir=tmp_path / "cancel", final_fake_asr=True)
    )
    workspace = manager.storage.create_job_workspace("job_cancel")

    assert manager.cancel("job_cancel") == {"jobId": "job_cancel", "status": "cancelled"}
    assert manager.status("job_cancel")["status"] == "cancelled"
    assert manager.storage.cleanup_expired().deleted == 1
    assert not workspace.exists()


def test_concurrency_limit_returns_safe_error_and_leaves_existing_job(tmp_path: Path) -> None:
    manager = FinalJobManager(
        Settings(asr_tmp_dir=tmp_path / "concurrency", final_fake_asr=True, max_concurrent_jobs=1)
    )
    workspace = manager.storage.create_job_workspace("job_busy")
    input_path = workspace / "input.wav"
    input_path.write_bytes(b"audio")
    manager._slots.acquire()
    try:
        try:
            manager.create_and_run(
                input_path, job_id="job_busy", meeting_id="meeting", language="en"
            )
            raise AssertionError("Expected concurrency limit")
        except Exception as error:
            assert getattr(error, "code", None) == "JOB_CONCURRENCY_LIMIT"
            assert "audio" not in getattr(error, "message", "").lower()
    finally:
        manager._slots.release()

    assert workspace.exists()
