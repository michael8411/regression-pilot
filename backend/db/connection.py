from contextlib import asynccontextmanager
from pathlib import Path
from re import A

import aiosqlite


DB_PATH = Path(__file__).resolve().parent.parent / "testdeck.db"


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
