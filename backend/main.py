from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import structlog

try:
    from backend.api.ai_routes import router as ai_router
    from backend.api.config_routes import router as config_router
    from backend.api.health_routes import router as health_router
    from backend.api.jira_routes import router as jira_router
    from backend.api.zephyr_routes import router as zephyr_router
    from backend.api.session_routes import router as session_router
    from backend.config.logging_config import setup_logging
    from backend.config.settings import get_settings
    from backend.db.init import init_db
    from backend.services.config_service import migrate_env_to_keyring
    from backend.utils.crypto import get_encryptor
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from api.ai_routes import router as ai_router
    from api.config_routes import router as config_router
    from api.health_routes import router as health_router
    from api.jira_routes import router as jira_router
    from api.zephyr_routes import router as zephyr_router
    from api.session_routes import router as session_router
    from config.logging_config import setup_logging
    from config.settings import get_settings
    from db.init import init_db
    from services.config_service import migrate_env_to_keyring
    from utils.crypto import get_encryptor

settings = get_settings()

is_dev = settings.app_env.lower() in {"dev", "development", "local"}
setup_logging(
    log_level=settings.log_level,
    enable_file_logging=settings.log_to_file and not is_dev,
    quiet_external_loggers=is_dev,
)
logger = structlog.get_logger("testdeck.backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global settings
    configured = settings.jira_configured
    logger.info(
        "backend_starting",
        jira_configured=configured,
        gemini_configured=bool(settings.gemini_api_key),
        zephyr_configured=bool(settings.zephyr_api_token),
    )
    migrated = migrate_env_to_keyring()
    logger.info("credential_migration_check", migrated_to_keyring=migrated)
    if migrated:
        settings = get_settings()
    get_encryptor()
    logger.info("encryptor_initialized")
    await init_db()
    yield
    logger.info("backend_stopping")


app = FastAPI(
    title="Testdeck",
    version="0.2.0",
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
app.include_router(session_router)

if __name__ == "__main__":
    import uvicorn

    backend_dir = Path(__file__).resolve().parent
    app_target = "backend.main:app" if __package__ else "main:app"
    uvicorn.run(
        app_target,
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
