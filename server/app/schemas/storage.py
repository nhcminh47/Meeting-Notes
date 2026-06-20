from pydantic import BaseModel


class StorageCounts(BaseModel):
    sessions: int
    jobs: int


class StorageSummary(BaseModel):
    storageMode: str
    tmpRoot: str
    totalBytes: int
    maxBytes: int
    overLimit: bool
    counts: StorageCounts


class CleanupSummary(BaseModel):
    deleted: int
    freedBytes: int
    errors: list[str]
