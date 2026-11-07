import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.api.routes import phrases, sessions, settings as settings_routes, speech, system
from app.config import Settings
from app.container import apply_stored_llm, build_container
from app.domain.errors import AppError

logger = logging.getLogger(__name__)


def create_app(settings=None):
    settings = settings or Settings.from_env()
    container = apply_stored_llm(build_container(settings))
    app = FastAPI(title="Speak With Me", version="0.1.0")
    app.state.container = container
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def handle_app_error(_request, exc: AppError):
        detail = {"code": exc.code, "message": exc.message}
        if exc.slot:
            detail["slot"] = exc.slot
        return JSONResponse(status_code=exc.status, content={"detail": detail})

    @app.get("/", include_in_schema=False)
    def open_app():
        target = settings.cors_origins[0] if settings.cors_origins else "http://localhost:5173"
        return RedirectResponse(target)

    app.include_router(system.router, prefix="/api/v1")
    app.include_router(settings_routes.router, prefix="/api/v1")
    app.include_router(phrases.router, prefix="/api/v1")
    app.include_router(sessions.router, prefix="/api/v1")
    app.include_router(speech.router, prefix="/api/v1")
    logger.info(
        "speak-with-me ready llm=%s stt=%s tts=%s",
        container.llm.name,
        settings.stt_provider,
        settings.tts_provider,
    )
    return app


app = create_app()
