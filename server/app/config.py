from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    server_host: str = "0.0.0.0"
    server_port: int = Field(default=8000, ge=1, le=65535)
    server_api_key: str = "change-me"
    server_storage_mode: str = "ephemeral"
    asr_tmp_dir: Path = Path("/tmp/asr-gateway")

    default_language: str = "en"
    default_live_engine: str = "faster-whisper-live"
    default_live_model: str = "small.en"
    default_final_engine: str = "faster-whisper"
    default_final_model: str = "medium.en"

    enable_vi: bool = False
    enable_live_vi: bool = False
    max_concurrent_live_sessions: int = Field(default=1, ge=1)
    max_concurrent_jobs: int = Field(default=1, ge=1)
    live_audio_buffer_seconds: int = Field(default=30, ge=1)
    live_chunk_retention_seconds: int = Field(default=120, ge=1)
    live_session_ttl_minutes: int = Field(default=240, ge=1)
    live_fake_asr: bool = False
    job_workspace_ttl_minutes: int = Field(default=30, ge=1)
    completed_job_ttl_minutes: int = Field(default=10, ge=1)
    failed_job_ttl_minutes: int = Field(default=30, ge=1)
    delete_input_after_job: bool = True
    delete_result_after_read: bool = True
    max_upload_mb: int = Field(default=1024, ge=1)
    max_tmp_storage_gb: float = Field(default=10, gt=0)


@lru_cache
def get_settings() -> Settings:
    return Settings()
