from pathlib import Path

from app.config import Settings
from app.jobs.diarization import DiarizationBackend, SpeakerSegment
from app.jobs.final_transcript import FinalTranscriptBackend, TranscriptSegment
from app.jobs.manager import FinalJobManager


class FakeAsr(FinalTranscriptBackend):
    def __init__(self, segments: list[TranscriptSegment]):
        self.segments = segments

    def transcribe_file(
        self, audio_path: Path, *, meeting_id: str, language: str
    ) -> list[TranscriptSegment]:
        return self.segments


class FakeDiarization(DiarizationBackend):
    def __init__(self, segments: list[SpeakerSegment]):
        self.segments = segments

    @property
    def available(self) -> bool:
        return True

    def diarize(self, audio_path: Path) -> list[SpeakerSegment]:
        return self.segments


def run_job(
    tmp_path: Path,
    asr: list[TranscriptSegment],
    diarization: list[SpeakerSegment],
):
    settings = Settings(
        asr_tmp_dir=tmp_path,
        enable_final_diarization=True,
        delete_input_after_job=False,
    )
    manager = FinalJobManager(
        settings,
        asr_backend=FakeAsr(asr),
        diarization_backend=FakeDiarization(diarization),
    )
    workspace = manager.storage.create_job_workspace("job_speakers")
    audio = workspace / "input.wav"
    audio.write_bytes(b"audio")
    return manager.create_and_run(
        audio, job_id="job_speakers", meeting_id="mtg_test", language="en"
    )


def test_diarization_maps_maximum_overlap_and_normalizes_first_appearance(tmp_path: Path) -> None:
    result = run_job(
        tmp_path,
        [
            TranscriptSegment("Second raw label appears first.", 0.0, 2.0),
            TranscriptSegment("Maximum overlap wins.", 2.0, 5.0),
            TranscriptSegment("No overlap.", 8.0, 9.0),
        ],
        [
            SpeakerSegment("raw_b", 0.0, 2.2),
            SpeakerSegment("raw_a", 1.9, 4.8),
            SpeakerSegment("raw_b", 4.8, 5.1),
        ],
    )

    assert result.diarizationStatus == "applied"
    assert [turn.speakerId for turn in result.turns] == [
        "SPEAKER_01",
        "SPEAKER_02",
        "UNKNOWN",
    ]
    assert [turn.id for turn in result.turns] == ["turn_001", "turn_002", "turn_003"]
    assert all(turn.speakerName is None for turn in result.turns)
    assert all(turn.source == "final" and turn.isFinal for turn in result.turns)


def test_result_is_ordered_before_speaker_mapping(tmp_path: Path) -> None:
    result = run_job(
        tmp_path,
        [TranscriptSegment("Later", 3.0, 4.0), TranscriptSegment("Earlier", 0.0, 1.0)],
        [SpeakerSegment("first", 0.0, 1.0), SpeakerSegment("second", 3.0, 4.0)],
    )

    assert [turn.text for turn in result.turns] == ["Earlier", "Later"]
    assert [turn.speakerId for turn in result.turns] == ["SPEAKER_01", "SPEAKER_02"]
