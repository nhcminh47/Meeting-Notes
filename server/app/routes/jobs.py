from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.auth import Protected
from app.config import Settings, get_settings
from app.errors import ApiError
from app.jobs import FinalJobManager
from app.schemas.jobs import CancelledJob, FinalTranscriptResult, JobCreated, JobStatus

router = APIRouter(prefix="/jobs", tags=["jobs"])
_AUDIO_EXTENSIONS = {
    ".aac",
    ".flac",
    ".m4a",
    ".mp3",
    ".mp4",
    ".ogg",
    ".opus",
    ".wav",
    ".webm",
}
_managers: dict[tuple[str, int, bool, bool, bool, str, str], FinalJobManager] = {}
_managers_lock = Lock()


def get_final_job_manager(
    settings: Annotated[Settings, Depends(get_settings)],
) -> FinalJobManager:
    key = (
        str(Path(settings.asr_tmp_dir).expanduser().resolve()),
        settings.max_concurrent_jobs,
        settings.delete_input_after_job,
        settings.delete_result_after_read,
        settings.final_fake_asr,
        settings.default_final_engine,
        settings.default_final_model,
    )
    with _managers_lock:
        if key not in _managers:
            _managers[key] = FinalJobManager(settings)
        return _managers[key]


Manager = Annotated[FinalJobManager, Depends(get_final_job_manager)]


@router.post("/finalize", response_model=JobCreated)
def finalize_recording(
    _: Protected,
    manager: Manager,
    file: Annotated[UploadFile, File()],
    meetingId: Annotated[str | None, Form()] = None,
    language: Annotated[str, Form()] = "en",
) -> dict[str, str]:
    if language != "en":
        raise ApiError(400, "INVALID_LANGUAGE", "Only English final transcripts are supported.")

    job_id = manager.new_job_id()
    workspace = manager.storage.create_job_workspace(job_id)
    requested_suffix = Path(file.filename or "audio.bin").suffix.lower()
    suffix = requested_suffix if requested_suffix in _AUDIO_EXTENSIONS else ".bin"
    input_path = workspace / f"input{suffix}"
    size = 0
    limit = manager.settings.max_upload_mb * 1024 * 1024
    try:
        with input_path.open("wb") as output:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise ApiError(413, "UPLOAD_TOO_LARGE", "Uploaded audio exceeds the size limit.")
                output.write(chunk)
        if size == 0:
            raise ApiError(400, "EMPTY_UPLOAD", "Uploaded audio is empty.")
    except ApiError:
        manager.storage.delete_job(job_id)
        raise
    except OSError as exc:
        manager.storage.delete_job(job_id)
        raise ApiError(500, "PROCESSING_ERROR", "Audio upload could not be stored.") from exc
    finally:
        file.file.close()

    resolved_meeting_id = meetingId.strip() if meetingId and meetingId.strip() else job_id
    try:
        result = manager.create_and_run(
            input_path, job_id=job_id, meeting_id=resolved_meeting_id, language=language
        )
    except ApiError as error:
        if error.code == "JOB_CONCURRENCY_LIMIT":
            manager.storage.delete_job(job_id)
        raise
    metadata = manager.storage.get_job_metadata(job_id)
    if metadata is None:
        raise ApiError(500, "PROCESSING_ERROR", "Transcript job status could not be read.")
    return {"jobId": result.jobId, "status": "completed", "createdAt": metadata.createdAt}


@router.get("/{job_id}", response_model=JobStatus)
def get_job(_: Protected, manager: Manager, job_id: str) -> dict[str, object]:
    return manager.status(job_id)


@router.get("/{job_id}/result", response_model=FinalTranscriptResult)
def get_result(_: Protected, manager: Manager, job_id: str) -> dict[str, object]:
    return manager.result(job_id)


@router.post("/{job_id}/cancel", response_model=CancelledJob)
def cancel_job(_: Protected, manager: Manager, job_id: str) -> dict[str, str]:
    return manager.cancel(job_id)
