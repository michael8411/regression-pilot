import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import structlog

try:
    from backend.api.ai_routes import router as ai_router
    from backend.api.auth_routes import router as auth_router
    from backend.api.config_routes import router as config_router
    from backend.api.health_routes import router as health_router
    from backend.api.jira_routes import router as jira_router
    from backend.api.zephyr_routes import router as zephyr_router
    from backend.api.session_routes import router as session_router
    from backend.api.conversation_routes import router as conversation_router
    from backend.api.live_routes import router as live_router
    from backend.api.mcp_routes import router as mcp_router
    from backend.api.cycle_routes import router as cycle_router
    from backend.api.project_repo_map_routes import router as repo_map_router
    from backend.services.mcp.runtime import get_runtime as get_mcp_runtime
    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
    )
    from backend.config.logging_config import setup_logging
    from backend.config.settings import get_settings
    from backend.config.paths import db_path, preferences_path, runtime_dir
    from backend.db.init import init_db
    from backend.security.local_auth import LocalAuthMiddleware, LOCAL_AUTH_TOKEN
    from backend.services.config_service import migrate_env_to_keyring
    from backend.utils.crypto import get_encryptor
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from api.ai_routes import router as ai_router
    from api.auth_routes import router as auth_router
    from api.config_routes import router as config_router
    from api.health_routes import router as health_router
    from api.jira_routes import router as jira_router
    from api.zephyr_routes import router as zephyr_router
    from api.session_routes import router as session_router
    from api.conversation_routes import router as conversation_router
    from api.live_routes import router as live_router
    from api.mcp_routes import router as mcp_router
    from api.cycle_routes import router as cycle_router
    from api.project_repo_map_routes import router as repo_map_router
    from services.mcp.runtime import get_runtime as get_mcp_runtime
    from services.mcp.managed_connections import (
        ensure_managed_connections,
    )
    from config.logging_config import setup_logging
    from config.settings import get_settings
    from config.paths import db_path, preferences_path, runtime_dir
    from db.init import init_db
    from security.local_auth import LocalAuthMiddleware, LOCAL_AUTH_TOKEN
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


def _migrate_legacy_data_files() -> None:
    """Copy backend/testdeck.db and backend/preferences.json to app data dir on first run."""
    backend_dir = Path(__file__).resolve().parent

    old_db = backend_dir / "testdeck.db"
    new_db = db_path()
    if old_db.exists() and not new_db.exists():
        shutil.copy2(old_db, new_db)
        for sidecar in ("testdeck.db-wal", "testdeck.db-shm"):
            old_sc = backend_dir / sidecar
            if old_sc.exists() and not (new_db.parent / sidecar).exists():
                shutil.copy2(old_sc, new_db.parent / sidecar)
        logger.info("db_file_migrated_to_app_data")
    elif old_db.exists():
        logger.info("db_file_migration_skipped_existing_target")

    old_prefs = backend_dir / "preferences.json"
    new_prefs = preferences_path()
    if old_prefs.exists() and not new_prefs.exists():
        shutil.copy2(old_prefs, new_prefs)
        logger.info("preferences_migrated_to_app_data")
    elif old_prefs.exists():
        logger.info("preferences_migration_skipped_existing_target")


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
    _migrate_legacy_data_files()
    await init_db()
    # Write per-launch auth token to runtime file so Tauri / dev tools can read it.
    try:
        _token_file = runtime_dir() / "backend-auth-token"
        _token_file.write_text(LOCAL_AUTH_TOKEN, encoding="utf-8")
        logger.info("backend_auth_token_written")
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("backend_auth_token_write_failed", error_class=type(exc).__name__)
    await get_mcp_runtime().start()
    logger.info("mcp_runtime_started")
    try:
        await ensure_managed_connections()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "managed_mcp_provisioning_failed",
            error_class=type(exc).__name__,
        )
    try:
        yield
    finally:
        try:
            await get_mcp_runtime().stop()
            logger.info("mcp_runtime_stopped")
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "mcp_runtime_stop_failed", error_class=type(exc).__name__
            )
        logger.info("backend_stopping")


app = FastAPI(
    title="Testdeck",
    version="0.2.0",
    lifespan=lifespan,
)

# LocalAuthMiddleware is added first so CORSMiddleware (added second) wraps it
# outermost, handling OPTIONS preflight before auth enforcement.
app.add_middleware(LocalAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["tauri://localhost", "http://localhost:5173", "http://localhost:1420"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(config_router)
app.include_router(jira_router)
app.include_router(ai_router)
app.include_router(zephyr_router)
app.include_router(session_router)
app.include_router(conversation_router)
app.include_router(live_router)
app.include_router(mcp_router)
app.include_router(cycle_router)
app.include_router(repo_map_router)

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
