from fastapi import FastAPI

from app.errors import install_error_handlers
from app.logging import configure_logging, install_request_logging
from app.routes import admin, engines, health, jobs, live, models


def create_app() -> FastAPI:
    configure_logging()
    application = FastAPI(title="ASR Gateway", version="0.1.0")
    install_error_handlers(application)
    install_request_logging(application)
    application.include_router(health.router)
    application.include_router(engines.router)
    application.include_router(models.router)
    application.include_router(admin.router)
    application.include_router(jobs.router)
    application.include_router(live.router)
    return application


app = create_app()
