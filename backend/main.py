from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.ai_routes import router as ai_router
from api.config_routes import router as config_router
from api.health_routes import router as health_router
from api.jira_routes import router as jira_router
from api.zephyr_routes import router as zephyr_router
from config.logging_config import setup_logging
from config.settings import get_settings
import structlog

settings = get_settings()
is_dev = settings.app_env.lower() in {"dev", "development", "local"}
setup_logging(log_level=settings.log_level, enable_file_logging=settings.log_to_file and not is_dev)
logger = structlog.get_logger("regression-pilot.backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configured = bool(settings.jira_base_url and settings.jira_email and settings.jira_api_token)
    logger.info(
        "backend_starting",
        jira_configured=configured,
        gemini_configured=bool(settings.gemini_api_key),
        zephyr_configured=bool(settings.zephyr_api_token),
    )
    yield
    logger.info("backend_stopping")


app = FastAPI(
    title="Regression Pilot",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["tauri://localhost", "http://localhost:5173", "http://localhost:1420"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(config_router)
app.include_router(jira_router)
app.include_router(ai_router)
app.include_router(zephyr_router)


if __name__ == "__main__":
    import uvicorn

    backend_dir = Path(__file__).resolve().parent
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=settings.backend_port,
        reload=is_dev,
        reload_dirs=[str(backend_dir)],
        reload_excludes=[
            "logs/*",
            ".venv/*",
            "__pycache__/*",
            "../frontend/*",
            ".git/*",
        ],
        log_level="warning" if is_dev else settings.log_level.lower(),
        access_log=not is_dev,
    )
