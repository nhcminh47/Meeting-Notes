from pathlib import Path

import pytest

from app.config import Settings
from app.jobs.diarization import DiarizationBackend, SpeakerSegment
from app.jobs.final_transcript import FinalTranscriptBackend, TranscriptSegment
from app.jobs.manager import FinalJobManager


class FakeAsr(FinalTranscriptBackend):
    def transcribe_file(
        self, audio_path: Path, *, meeting_id: str, language: str
    ) -> list[TranscriptSegment]:
        return [TranscriptSegment("Dialogue, not a bullet.", 0.0, 1.0)]


class ConfigurableDiarization(DiarizationBackend):
    def __init__(self, value: object = None, *, available: bool = True, error: bool = False):
        self.value = value
        self._available = available
        self.error = error

    @property
    def available(self) -> bool:
        return self._available

    def diarize(self, audio_path: Path) -> list[SpeakerSegment]:
        if self.error:
            raise RuntimeError("private backend detail")
        return self.value  # type: ignore[return-value]


@pytest.mark.parametrize(
    ("backend", "expected_status"),
    [
        (ConfigurableDiarization(available=False), "unavailable"),
        (ConfigurableDiarization(error=True), "failed"),
        (ConfigurableDiarization([]), "empty"),
        (ConfigurableDiarization([{"speaker": "bad"}]), "failed"),
    ],
)
def test_diarization_problem_completes_with_single_speaker_fallback(
    tmp_path: Path, backend: DiarizationBackend, expected_status: str
) -> None:
    manager = FinalJobManager(
        Settings(asr_tmp_dir=tmp_path, enable_final_diarization=True),
        asr_backend=FakeAsr(),
        diarization_backend=backend,
    )
    workspace = manager.storage.create_job_workspace("job_fallback")
    audio = workspace / "input.wav"
    audio.write_bytes(b"audio")

    result = manager.create_and_run(
        audio, job_id="job_fallback", meeting_id="mtg_test", language="en"
    )

    assert result.diarizationStatus == expected_status
    assert result.turns[0].speakerId == "SPEAKER_01"
    assert manager.status("job_fallback")["status"] == "completed"


def test_disabled_configuration_does_not_invoke_diarization(tmp_path: Path) -> None:
    backend = ConfigurableDiarization(error=True)
    manager = FinalJobManager(
        Settings(asr_tmp_dir=tmp_path, enable_final_diarization=False),
        asr_backend=FakeAsr(),
        diarization_backend=backend,
    )
    workspace = manager.storage.create_job_workspace("job_disabled")
    audio = workspace / "input.wav"
    audio.write_bytes(b"audio")

    result = manager.create_and_run(
        audio, job_id="job_disabled", meeting_id="mtg_test", language="en"
    )

    assert result.diarizationStatus == "unavailable"
    assert result.turns[0].speakerId == "SPEAKER_01"


class FailingAsr(FinalTranscriptBackend):
    def transcribe_file(
        self, audio_path: Path, *, meeting_id: str, language: str
    ) -> list[TranscriptSegment]:
        raise RuntimeError("ASR failed")


def test_asr_failure_still_fails_the_job(tmp_path: Path) -> None:
    manager = FinalJobManager(Settings(asr_tmp_dir=tmp_path), asr_backend=FailingAsr())
    workspace = manager.storage.create_job_workspace("job_asr_failure")
    audio = workspace / "input.wav"
    audio.write_bytes(b"audio")

    with pytest.raises(Exception) as error:
        manager.create_and_run(
            audio, job_id="job_asr_failure", meeting_id="mtg_test", language="en"
        )

    assert getattr(error.value, "code", None) == "PROCESSING_ERROR"
    assert manager.status("job_asr_failure")["status"] == "failed"
