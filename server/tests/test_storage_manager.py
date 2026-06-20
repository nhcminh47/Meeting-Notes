import json
from datetime import timedelta
from pathlib import Path

import pytest

from app.config import Settings
from app.storage.manager import TempWorkspaceManager
from app.storage.models import format_datetime, utc_now


@pytest.fixture
def manager(tmp_path: Path) -> TempWorkspaceManager:
    return TempWorkspaceManager(Settings(asr_tmp_dir=tmp_path / "managed"))


def expire(workspace: Path) -> None:
    metadata_path = workspace / ".workspace.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["expiresAt"] = format_datetime(utc_now() - timedelta(minutes=1))
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")


def test_workspace_creation_stays_inside_managed_root(manager: TempWorkspaceManager) -> None:
    session = manager.create_session_workspace("session_123")
    job = manager.create_job_workspace("job_123")

    assert session.parent == manager.sessions_root
    assert job.parent == manager.jobs_root
    assert json.loads((job / ".workspace.json").read_text(encoding="utf-8"))["status"] == "running"

    with pytest.raises(ValueError):
        manager.create_job_workspace("../../outside")


def test_cleanup_deletes_expired_and_preserves_running_workspace(manager: TempWorkspaceManager) -> None:
    expired = manager.create_session_workspace("expired")
    active = manager.create_job_workspace("active")
    expire(expired)

    result = manager.cleanup_expired()

    assert result.deleted == 1
    assert not expired.exists()
    assert active.exists()


def test_cleanup_is_idempotent(manager: TempWorkspaceManager) -> None:
    workspace = manager.create_job_workspace("old_job")
    expire(workspace)

    assert manager.cleanup_expired().deleted == 1
    assert manager.cleanup_expired().deleted == 0


def test_terminal_job_ttls_and_cancelled_cleanup(manager: TempWorkspaceManager) -> None:
    completed = manager.create_job_workspace("completed")
    failed = manager.create_job_workspace("failed")
    cancelled = manager.create_job_workspace("cancelled")

    manager.mark_job_completed("completed")
    manager.mark_job_failed("failed")
    manager.mark_job_cancelled("cancelled")

    assert json.loads((completed / ".workspace.json").read_text())["status"] == "completed"
    assert json.loads((failed / ".workspace.json").read_text())["status"] == "failed"
    assert manager.cleanup_expired().deleted == 1
    assert not cancelled.exists()


def test_cleanup_deletes_safe_orphan(manager: TempWorkspaceManager) -> None:
    orphan = manager.jobs_root / "orphan"
    orphan.mkdir()
    (orphan / "audio.bin").write_bytes(b"temporary")

    assert manager.cleanup_expired().deleted == 1
    assert not orphan.exists()


def test_storage_summary_and_limit_guard(tmp_path: Path) -> None:
    manager = TempWorkspaceManager(
        Settings(asr_tmp_dir=tmp_path / "managed", max_tmp_storage_gb=0.000000001)
    )
    workspace = manager.create_job_workspace("large")
    (workspace / "input.bin").write_bytes(b"x" * 32)

    summary = manager.get_storage_summary()

    assert summary["totalBytes"] >= 32
    assert summary["counts"] == {"sessions": 0, "jobs": 1}
    assert summary["overLimit"] is True
    assert manager.ensure_within_storage_limit() is False
    assert workspace.exists()


def test_cleanup_never_targets_outside_root(manager: TempWorkspaceManager, tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    sentinel = outside / "keep.txt"
    sentinel.write_text("durable client data", encoding="utf-8")

    with pytest.raises(ValueError):
        manager.delete_job("../outside")
    manager.cleanup_expired()

    assert sentinel.read_text(encoding="utf-8") == "durable client data"


def test_delete_result_after_read_hook(manager: TempWorkspaceManager) -> None:
    workspace = manager.create_job_workspace("result_job")
    result = workspace / "result.json"
    result.write_text('{"temporary":true}', encoding="utf-8")

    assert manager.delete_result_after_read("result_job") is True
    assert not result.exists()
    assert workspace.exists()
