import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from cryptography.fernet import InvalidToken

try:
    from backend.db.connection import get_connection
    from backend.utils.crypto import decrypt_value, encrypt_value
    from backend.utils.secret_scanner import scan_for_secrets
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from db.connection import get_connection
    from utils.crypto import decrypt_value, encrypt_value
    from utils.secret_scanner import scan_for_secrets


logger = structlog.get_logger("testdeck.session_service")


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
    async with get_connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        await db.execute("UPDATE sessions SET is_active = 0 WHERE is_active = 1")
        await db.execute(
            """
            INSERT INTO sessions (id, project_key, version_name, created_at, updated_at, is_active, status)
            VALUES (:id, :project_key, :version_name, :created_at, :updated_at, :is_active, :status)
            """,
            session,
        )
        await db.commit()

    logger.info("session_created", session_id=session_id)
    return {**session, "state": {}}


async def get_session_by_id(session_id: str) -> dict | None:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return dict(row)


async def get_active_session() -> dict | None:
    async with get_connection() as db:
        cursor = await db.execute("SELECT * FROM sessions WHERE is_active = 1")
        row = await cursor.fetchone()
        if row is None:
            return None

        session = dict(row)
        state_cursor = await db.execute(
            "SELECT key, value FROM session_state WHERE session_id = ?",
            (session["id"],),
        )
        state_rows = await state_cursor.fetchall()

        state: dict[str, Any] = {}
        for state_row in state_rows:
            try:
                json_str = decrypt_value(state_row["value"])
                state[state_row["key"]] = json.loads(json_str)
            except (InvalidToken, json.JSONDecodeError):
                logger.warning(
                    "state_decrypt_failed",
                    session_id=session["id"],
                    state_key=state_row["key"],
                )
                continue
        return {**session, "state": state}


async def save_state(session_id: str, key: str, value: Any) -> list[dict]:
    json_str = json.dumps(value)

    findings = scan_for_secrets(json_str)
    if findings:
        logger.warning(
            "secret_scan_hit",
            session_id=session_id,
            state_key=key,
            patterns=[f["pattern_name"] for f in findings],
        )

    encrypted = encrypt_value(json_str)
    now = datetime.now(timezone.utc).isoformat()
    async with get_connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        await db.execute(
            """
            INSERT INTO session_state (session_id, key, value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(session_id, key)
            DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (session_id, key, encrypted, now),
        )
        await db.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        await db.commit()

    return [{"pattern_name": f["pattern_name"]} for f in findings]

async def save_state_batch(session_id: str, items: dict) -> list[dict]:
    if not items:
        return []

    combined: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()

    prepared = []
    for key, value in items.items():
        json_str = json.dumps(value)
        findings = scan_for_secrets(json_str)
        if findings:
            logger.warning(
                "secret_scan_hit",
                session_id=session_id,
                state_key=key,
                patterns=[f["pattern_name"] for f in findings],
            )
            combined.extend({"pattern_name": f["pattern_name"]} for f in findings)

        prepared.append((key, encrypt_value(json_str)))

    async with get_connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        for key, encrypted in prepared:
            await db.execute(
                """
                INSERT INTO session_state (session_id, key, value, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(session_id, key)
                DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (session_id, key, encrypted, now),
            )
        await db.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        await db.commit()

    return combined


async def list_sessions(limit: int = 20) -> list[dict]:
    async with get_connection() as db:
        cursor = await db.execute(
            """
            SELECT id, project_key, version_name, status, created_at, updated_at, is_active
            FROM sessions
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_state(session_id: str, key: str) -> Any | None:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT value FROM session_state WHERE session_id = ? AND key = ?",
            (session_id, key),
        )
        row = await cursor.fetchone()
        if not row:
            return None

        try:
            json_str = decrypt_value(row["value"])
            return json.loads(json_str)
        except (InvalidToken, json.JSONDecodeError):
            logger.warning(
                "state_decrypt_failed",
                session_id=session_id,
                state_key=key,
            )
            return None

async def activate_session(session_id: str) -> dict | None:
    async with get_connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        await db.execute("UPDATE sessions SET is_active = 0 WHERE is_active = 1")
        await db.execute(
            "UPDATE sessions SET is_active = 1 WHERE id = ?",
            (session_id,),
        )
        await db.commit()
    logger.info("session_activated", session_id=session_id)
    return await get_active_session()


async def delete_session(session_id: str) -> None:
    async with get_connection() as db:
        await db.execute(
            "DELETE FROM sessions WHERE id = ?",
            (session_id,),
        )
        await db.commit()
    logger.info("session_deleted", session_id=session_id)