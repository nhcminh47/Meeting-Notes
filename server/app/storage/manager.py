from __future__ import annotations

import json
import logging
import os
import re
import shutil
from datetime import timedelta
from pathlib import Path

from app.config import Settings
from app.storage.models import (
    CleanupResult,
    WorkspaceKind,
    WorkspaceMetadata,
    WorkspaceStatus,
    format_datetime,
    parse_datetime,
    utc_now,
)

_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_METADATA_FILE = ".workspace.json"
logger = logging.getLogger("asr_gateway.storage")


class TempWorkspaceManager:
    """Owns short-lived artifacts located strictly below one managed root."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.root = Path(settings.asr_tmp_dir).expanduser().resolve()
        self.sessions_root = self.root / "sessions"
        self.jobs_root = self.root / "jobs"
        self.chunks_root = self.root / "chunks"
        for directory in (self.sessions_root, self.jobs_root, self.chunks_root):
            directory.mkdir(parents=True, exist_ok=True)

    def create_session_workspace(self, session_id: str) -> Path:
        return self._create_workspace("session", session_id, self.settings.live_session_ttl_minutes)

    def create_job_workspace(self, job_id: str) -> Path:
        return self._create_workspace("job", job_id, self.settings.job_workspace_ttl_minutes)

    def get_session_workspace(self, session_id: str) -> Path | None:
        return self._get_workspace("session", session_id)

    def get_job_workspace(self, job_id: str) -> Path | None:
        return self._get_workspace("job", job_id)

    def mark_job_completed(self, job_id: str) -> None:
        self._mark_job(job_id, "completed", self.settings.completed_job_ttl_minutes)

    def mark_job_failed(self, job_id: str) -> None:
        self._mark_job(job_id, "failed", self.settings.failed_job_ttl_minutes)

    def mark_job_cancelled(self, job_id: str) -> None:
        self._mark_job(job_id, "cancelled", 0)

    def delete_session(self, session_id: str) -> bool:
        return self._delete_workspace(self._workspace_path("session", session_id)) > 0

    def delete_job(self, job_id: str) -> bool:
        return self._delete_workspace(self._workspace_path("job", job_id)) > 0

    def delete_result_after_read(self, job_id: str) -> bool:
        if not self.settings.delete_result_after_read:
            return False
        workspace = self.get_job_workspace(job_id)
        if workspace is None:
            return False
        deleted = False
        for name in ("result", "result.json"):
            target = workspace / name
            if target.is_symlink() or target.is_file():
                target.unlink(missing_ok=True)
                deleted = True
            elif target.is_dir():
                shutil.rmtree(target)
                deleted = True
        return deleted

    def cleanup_expired(self) -> CleanupResult:
        deleted = 0
        freed_bytes = 0
        errors: list[str] = []
        now = utc_now()
        for kind, parent in (("session", self.sessions_root), ("job", self.jobs_root)):
            for workspace in list(parent.iterdir()):
                if not workspace.is_dir() or workspace.is_symlink():
                    continue
                try:
                    metadata = self._read_metadata(workspace)
                    invalid = metadata.id != workspace.name or metadata.kind != kind
                    expired = parse_datetime(metadata.expiresAt) <= now
                    cancelled = metadata.status == "cancelled"
                    if invalid or expired or cancelled:
                        size = self._path_size(workspace)
                        self._remove_path(workspace)
                        deleted += 1
                        freed_bytes += size
                        logger.info(
                            "workspace deleted",
                            extra={"workspace_id": workspace.name, "workspace_kind": kind},
                        )
                except (OSError, ValueError, TypeError, json.JSONDecodeError):
                    # A direct child with unusable metadata is an orphan. It is safe to
                    # remove because parent is a manager-owned directory under root.
                    try:
                        size = self._path_size(workspace)
                        self._remove_path(workspace)
                        deleted += 1
                        freed_bytes += size
                    except OSError:
                        errors.append(f"ORPHAN_DELETE_FAILED:{kind}:{workspace.name}")
                        logger.warning("orphan delete failed", extra={"workspace_kind": kind})
        return CleanupResult(deleted, freed_bytes, errors)

    def get_storage_summary(self) -> dict[str, object]:
        total_bytes = self._path_size(self.root)
        max_bytes = int(self.settings.max_tmp_storage_gb * 1024**3)
        return {
            "storageMode": self.settings.server_storage_mode,
            "tmpRoot": str(self.root),
            "totalBytes": total_bytes,
            "maxBytes": max_bytes,
            "overLimit": total_bytes > max_bytes,
            "counts": {
                "sessions": self._workspace_count(self.sessions_root),
                "jobs": self._workspace_count(self.jobs_root),
            },
        }

    def ensure_within_storage_limit(self) -> bool:
        self.cleanup_expired()
        return not bool(self.get_storage_summary()["overLimit"])

    def _create_workspace(self, kind: WorkspaceKind, workspace_id: str, ttl_minutes: int) -> Path:
        workspace = self._workspace_path(kind, workspace_id)
        workspace.mkdir(parents=False, exist_ok=False)
        now = utc_now()
        metadata = WorkspaceMetadata(
            id=workspace_id,
            kind=kind,
            status="running",
            createdAt=format_datetime(now),
            updatedAt=format_datetime(now),
            expiresAt=format_datetime(now + timedelta(minutes=ttl_minutes)),
        )
        self._write_metadata(workspace, metadata)
        return workspace

    def _get_workspace(self, kind: WorkspaceKind, workspace_id: str) -> Path | None:
        workspace = self._workspace_path(kind, workspace_id)
        return workspace if workspace.is_dir() and not workspace.is_symlink() else None

    def _mark_job(self, job_id: str, status: WorkspaceStatus, ttl_minutes: int) -> None:
        workspace = self.get_job_workspace(job_id)
        if workspace is None:
            raise FileNotFoundError(f"Unknown job workspace: {job_id}")
        previous = self._read_metadata(workspace)
        now = utc_now()
        self._write_metadata(
            workspace,
            WorkspaceMetadata(
                id=previous.id,
                kind="job",
                status=status,
                createdAt=previous.createdAt,
                updatedAt=format_datetime(now),
                expiresAt=format_datetime(now + timedelta(minutes=ttl_minutes)),
            ),
        )

    def _workspace_path(self, kind: WorkspaceKind, workspace_id: str) -> Path:
        if not _ID_PATTERN.fullmatch(workspace_id) or workspace_id in (".", ".."):
            raise ValueError("Workspace ID contains unsupported characters")
        parent = self.sessions_root if kind == "session" else self.jobs_root
        candidate = parent / workspace_id
        if candidate.parent.resolve() != parent.resolve():
            raise ValueError("Workspace must remain inside the managed root")
        return candidate

    def _write_metadata(self, workspace: Path, metadata: WorkspaceMetadata) -> None:
        temporary = workspace / f"{_METADATA_FILE}.tmp"
        temporary.write_text(json.dumps(metadata.to_dict(), separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, workspace / _METADATA_FILE)

    def _read_metadata(self, workspace: Path) -> WorkspaceMetadata:
        value = json.loads((workspace / _METADATA_FILE).read_text(encoding="utf-8"))
        return WorkspaceMetadata.from_dict(value)

    def _delete_workspace(self, workspace: Path) -> int:
        if not workspace.exists() and not workspace.is_symlink():
            return 0
        size = self._path_size(workspace)
        self._remove_path(workspace)
        return size or 1

    def _remove_path(self, path: Path) -> None:
        if path.parent.resolve() not in (self.sessions_root.resolve(), self.jobs_root.resolve()):
            raise ValueError("Refusing to delete outside managed workspace roots")
        if path.is_symlink() or path.is_file():
            path.unlink(missing_ok=True)
        elif path.exists():
            shutil.rmtree(path)

    @staticmethod
    def _path_size(path: Path) -> int:
        if path.is_symlink():
            return 0
        if path.is_file():
            try:
                return path.stat().st_size
            except FileNotFoundError:
                return 0
        total = 0
        if path.exists():
            for child in path.rglob("*"):
                if child.is_file() and not child.is_symlink():
                    try:
                        total += child.stat().st_size
                    except FileNotFoundError:
                        pass
        return total

    @staticmethod
    def _workspace_count(parent: Path) -> int:
        return sum(1 for path in parent.iterdir() if path.is_dir() and not path.is_symlink())
