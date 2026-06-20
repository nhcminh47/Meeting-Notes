from __future__ import annotations

import json
import os
import threading
import uuid
from pathlib import Path

from app.config import Settings
from app.errors import ApiError
from app.jobs.final_transcript import create_final_transcript_backend
from app.jobs.models import FinalTranscriptResult, TranscriptTurn
from app.storage import TempWorkspaceManager
from app.storage.models import format_datetime, utc_now

_RESULT_FILE = "result.json"


class FinalJobManager:
    """Runs final ASR jobs and keeps all artifacts in managed ephemeral workspaces."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.storage = TempWorkspaceManager(settings)
        self._slots = threading.BoundedSemaphore(settings.max_concurrent_jobs)

    def create_and_run(
        self, input_path: Path, *, job_id: str, meeting_id: str, language: str
    ) -> FinalTranscriptResult:
        if not self._slots.acquire(blocking=False):
            raise ApiError(429, "JOB_CONCURRENCY_LIMIT", "Too many transcript jobs are running.")
        try:
            backend = create_final_transcript_backend(self.settings)
            segments = backend.transcribe_file(
                input_path, meeting_id=meeting_id, language=language
            )
            metadata = self.storage.get_job_metadata(job_id)
            if metadata is None or metadata.status == "cancelled":
                raise ApiError(409, "JOB_CANCELLED", "Transcript job was cancelled.")
            ordered = sorted(segments, key=lambda segment: (segment.start, segment.end))
            result = FinalTranscriptResult(
                schemaVersion=1,
                jobId=job_id,
                meetingId=meeting_id,
                language=language,
                generatedAt=format_datetime(utc_now()),
                turns=[
                    TranscriptTurn(
                        id=f"turn_{index:03d}",
                        meetingId=meeting_id,
                        speakerId="SPEAKER_01",
                        speakerName=None,
                        start=segment.start,
                        end=segment.end,
                        text=segment.text,
                        language=language,
                        confidence=segment.confidence,
                    )
                    for index, segment in enumerate(ordered, start=1)
                ],
            )
            self._write_result(input_path.parent, result)
            self.storage.mark_job_completed(job_id)
            return result
        except ApiError:
            raise
        except Exception as exc:
            try:
                self.storage.mark_job_failed(job_id)
            except FileNotFoundError:
                pass
            raise ApiError(500, "PROCESSING_ERROR", "Final transcript processing failed.") from exc
        finally:
            if self.settings.delete_input_after_job:
                input_path.unlink(missing_ok=True)
            self._slots.release()

    def status(self, job_id: str) -> dict[str, object]:
        metadata = self.storage.get_job_metadata(job_id)
        if metadata is None:
            raise ApiError(404, "JOB_NOT_FOUND", "Transcript job was not found.")
        return {
            "jobId": job_id,
            "status": metadata.status,
            "createdAt": metadata.createdAt,
            "updatedAt": metadata.updatedAt,
            "expiresAt": metadata.expiresAt,
            "error": "Final transcript processing failed." if metadata.status == "failed" else None,
        }

    def result(self, job_id: str) -> dict[str, object]:
        status = self.status(job_id)["status"]
        if status == "cancelled":
            raise ApiError(409, "JOB_CANCELLED", "Transcript job was cancelled.")
        if status == "failed":
            raise ApiError(409, "JOB_FAILED", "Transcript job failed.")
        if status != "completed":
            raise ApiError(409, "JOB_NOT_READY", "Transcript job result is not ready.")
        workspace = self.storage.get_job_workspace(job_id)
        result_path = workspace / _RESULT_FILE if workspace else None
        if result_path is None or not result_path.is_file():
            raise ApiError(409, "JOB_NOT_READY", "Transcript job result is no longer available.")
        try:
            result = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ApiError(500, "PROCESSING_ERROR", "Transcript result could not be read.") from exc
        self.storage.delete_result_after_read(job_id)
        return result

    def cancel(self, job_id: str) -> dict[str, str]:
        status = self.status(job_id)["status"]
        if status not in ("queued", "running"):
            raise ApiError(409, "JOB_NOT_READY", "Transcript job can no longer be cancelled.")
        self.storage.mark_job_cancelled(job_id)
        return {"jobId": job_id, "status": "cancelled"}

    @staticmethod
    def new_job_id() -> str:
        return f"job_{uuid.uuid4().hex}"

    @staticmethod
    def _write_result(workspace: Path, result: FinalTranscriptResult) -> None:
        temporary = workspace / f"{_RESULT_FILE}.tmp"
        temporary.write_text(
            json.dumps(result.to_dict(), separators=(",", ":")), encoding="utf-8"
        )
        os.replace(temporary, workspace / _RESULT_FILE)
