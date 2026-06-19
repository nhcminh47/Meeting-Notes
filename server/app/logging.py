import json
import logging
import sys
import time

from fastapi import FastAPI, Request


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in ("method", "path", "status", "duration_ms"):
            if hasattr(record, field):
                payload[field] = getattr(record, field)
        return json.dumps(payload, separators=(",", ":"))


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


def install_request_logging(app: FastAPI) -> None:
    logger = logging.getLogger("asr_gateway.request")

    @app.middleware("http")
    async def log_request(request: Request, call_next):
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            logger.info(
                "request completed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": status,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
