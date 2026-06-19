from pydantic import BaseModel


class PublicHealth(BaseModel):
    status: str
    service: str


class GpuStatus(BaseModel):
    available: bool
    name: str | None


class ModelConfiguration(BaseModel):
    live: str
    final: str


class PrivateHealth(PublicHealth):
    storageMode: str
    gpu: GpuStatus
    models: ModelConfiguration
