from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Literal

WorkspaceKind = Literal["session", "job"]
WorkspaceStatus = Literal["running", "completed", "failed", "cancelled", "expired"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def format_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


@dataclass(frozen=True)
class WorkspaceMetadata:
    id: str
    kind: WorkspaceKind
    status: WorkspaceStatus
    createdAt: str
    updatedAt: str
    expiresAt: str

    def to_dict(self) -> dict[str, str]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: object) -> WorkspaceMetadata:
        if not isinstance(value, dict):
            raise ValueError("Metadata must be an object")
        metadata = cls(**value)
        if metadata.kind not in ("session", "job"):
            raise ValueError("Invalid workspace kind")
        if metadata.status not in ("running", "completed", "failed", "cancelled", "expired"):
            raise ValueError("Invalid workspace status")
        parse_datetime(metadata.createdAt)
        parse_datetime(metadata.updatedAt)
        parse_datetime(metadata.expiresAt)
        return metadata


@dataclass(frozen=True)
class CleanupResult:
    deleted: int
    freed_bytes: int
    errors: list[str]
