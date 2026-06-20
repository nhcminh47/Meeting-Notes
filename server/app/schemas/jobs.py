from typing import Literal

from pydantic import BaseModel


class JobCreated(BaseModel):
    jobId: str
    status: Literal["completed"]
    createdAt: str


class JobStatus(BaseModel):
    jobId: str
    status: Literal["queued", "running", "completed", "failed", "cancelled", "expired"]
    createdAt: str
    updatedAt: str
    expiresAt: str
    error: str | None


class TranscriptTurn(BaseModel):
    id: str
    meetingId: str
    speakerId: str
    speakerName: str | None
    start: float
    end: float
    text: str
    language: str
    source: Literal["final"]
    isFinal: Literal[True]
    confidence: float | None


class FinalTranscriptResult(BaseModel):
    schemaVersion: Literal[1]
    jobId: str
    meetingId: str
    language: str
    generatedAt: str
    diarizationStatus: Literal["unavailable", "failed", "empty", "applied"]
    turns: list[TranscriptTurn]


class CancelledJob(BaseModel):
    jobId: str
    status: Literal["cancelled"]
