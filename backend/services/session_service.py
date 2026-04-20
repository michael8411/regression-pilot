import uuid
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from contextlib import asynccontextmanager
import aiosqlite


DB_PATH = Path(__file__).resolve().parent.parent / "testdeck.db"

@asynccontextmanager
async def _get_connection():
    db = await aiosqlite.connect(DB_PATH)
    try:
        db.row_factory = aiosqlite.Row
        
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("PRAGMA busy_timeout = 5000")
        await db.execute("PRAGMA synchronous = NORMAL")
        await db.execute("PRAGMA cache_size = -64000")
        await db.execute("PRAGMA temp_store = MEMORY")
        yield db
    finally:
        await db.close()

async def init_db():
    async with _get_connection() as db:
        await db.execute("PRAGMA journal_mode = WAL")

        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                project_key TEXT NOT NULL,
                version_name TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                status TEXT DEFAULT 'in_progress'
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS session_state (
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (session_id, key)
            )
        """)
        await db.commit()
async def get_session_by_id(session_id: str) -> dict | None:
    async with _get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return dict(row)

async def create_session(project_key: str, version_name: str | None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    session_id = str(uuid.uuid4())
    session = {
        "id": session_id,
        "project_key": project_key,
        "version_name": version_name,
        "created_at": now,
        "updated_at": now,
        "is_active": 1,
        "status": "in_progress",
    }
    async with _get_connection() as db:
        await db.execute("BEGIN")
        await db.execute("UPDATE sessions SET is_active = 0 WHERE is_active = 1")
        await db.execute(
            """
            INSERT INTO sessions (id, project_key, version_name, created_at, updated_at, is_active, status)
            VALUES (:id, :project_key, :version_name, :created_at, :updated_at, :is_active, :status)
            """,
            session,
        )
        await db.commit()
    return {**session, "state": {}}

async def get_active_session() -> dict | None:
    async with _get_connection() as db:
        cursor = await db.execute("SELECT * FROM sessions WHERE is_active = 1")
        row = await cursor.fetchone()
        if row is None:
            return None

        session = dict(row)
        state_cursor = await db.execute(
            "SELECT key, value FROM session_state WHERE session_id = ?",
            (session["id"],)
        )

        state_rows = await state_cursor.fetchall()
        state = {}
        for state_row in state_rows:
            try:
                state[state_row["key"]] = json.loads(state_row["value"])
            except json.JSONDecodeError:
                pass
        return {**session, "state": state}

async def save_state(session_id: str, key: str, value: Any) -> None:
    serialized = json.dumps(value)
    now = datetime.now(timezone.utc).isoformat()
    async with _get_connection() as db:
        await db.execute(
            """
            INSERT INTO session_state (session_id, key, value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(session_id, key)
            DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (session_id, key, serialized, now),
        )
        await db.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        await db.commit()

async def get_state(session_id: str, key: str) -> Any | None:
    async with _get_connection() as db:
        cursor = await db.execute(
            "SELECT value FROM session_state WHERE session_id = ? AND key = ?",
            (session_id, key),
        )
        row = await cursor.fetchone()
        if not row:
            return None

        try:
            return json.loads(row["value"])
        except json.JSONDecodeError:
            return None