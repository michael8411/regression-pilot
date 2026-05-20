from contextlib import asynccontextmanager
from pathlib import Path
import aiosqlite

try:
    from backend.config.paths import db_path as _paths_db_path
except ImportError:
    from config.paths import db_path as _paths_db_path

# Computed at module load; tests can override via monkeypatch.setattr(conn_mod, "DB_PATH", …)
DB_PATH: Path = _paths_db_path()


@asynccontextmanager
async def get_connection():
    db = await aiosqlite.connect(DB_PATH)
    try:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("PRAGMA busy_timeout = 5000")
        await db.execute("PRAGMA synchronous = NORMAL")
        await db.execute("PRAGMA temp_store = MEMORY")
        yield db
    finally:
        await db.close()
