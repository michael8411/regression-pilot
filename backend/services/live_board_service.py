import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import structlog

try:
    from backend.db.connection import get_connection
    from backend.utils.crypto import decrypt_value, encrypt_value
    from backend.utils.secret_scanner import scan_for_secrets
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from db.connection import get_connection
    from utils.crypto import decrypt_value, encrypt_value
    from utils.secret_scanner import scan_for_secrets


logger = structlog.get_logger("testdeck.live_boards")

DEFAULT_COLUMNS = ["To Do", "In Progress", "In Review", "Done"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_decrypt(blob: str, fallback: str = "") -> str:
    try:
        return decrypt_value(blob)
    except Exception:
        logger.warning("live_board_decrypt_failed")
        return fallback


def _safe_json_loads(raw: str, fallback):
    try:
        return json.loads(raw or "")
    except (json.JSONDecodeError, TypeError):
        return fallback


def _validate_name(name: str) -> str:
    name = (name or "").strip()[:120]
    if not name:
        raise ValueError("Board name is required")
    findings = scan_for_secrets(name)
    if findings:
        logger.warning(
            "live_board_name_secret_rejected",
            patterns=[f["pattern_name"] for f in findings if isinstance(f, dict)],
        )
        raise ValueError("Board name appears to contain a secret")
    return name


def _decrypt_profile_blob(blob: str) -> Optional[dict]:
    """Decrypt an encrypted JSON blob; return None if empty or unreadable."""
    if not blob:
        return None
    try:
        loaded = json.loads(decrypt_value(blob))
    except Exception:
        logger.warning("live_board_profile_decrypt_failed")
        return None
    return loaded if isinstance(loaded, dict) else None


def _encrypt_profile_blob(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    return encrypt_value(json.dumps(value, default=str))


def _row_to_board(row) -> dict:
    # Phase 01: `profile` and `view_prefs` may be missing on legacy rows
    # that predate the migration. SQLite Row objects raise IndexError when
    # asked for a column that doesn't exist; guard defensively.
    profile_blob = ""
    view_prefs_blob = ""
    try:
        profile_blob = row["profile"] or ""
    except (IndexError, KeyError):
        profile_blob = ""
    try:
        view_prefs_blob = row["view_prefs"] or ""
    except (IndexError, KeyError):
        view_prefs_blob = ""

    return {
        "id": row["id"],
        "name": row["name"],
        "jql": _safe_decrypt(row["jql"], ""),
        "columns": _safe_json_loads(row["columns"], DEFAULT_COLUMNS),
        "pinned": bool(row["pinned"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "profile": _decrypt_profile_blob(profile_blob),
        "view_prefs": _decrypt_profile_blob(view_prefs_blob),
    }


async def create_board(
    *,
    name: str,
    jql: str,
    columns: Optional[list[str]] = None,
    profile: Any = None,
    view_prefs: Any = None,
) -> dict:
    name = _validate_name(name)
    bid = str(uuid.uuid4())
    now = _now_iso()
    cols = json.dumps(columns or DEFAULT_COLUMNS)
    encrypted_jql = encrypt_value(jql)
    profile_blob = _encrypt_profile_blob(profile)
    view_prefs_blob = _encrypt_profile_blob(view_prefs)

    async with get_connection() as db:
        await db.execute(
            "INSERT INTO live_boards "
            "(id, name, jql, columns, pinned, created_at, updated_at, "
            " profile, view_prefs) "
            "VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)",
            (
                bid,
                name,
                encrypted_jql,
                cols,
                now,
                now,
                profile_blob,
                view_prefs_blob,
            ),
        )
        await db.commit()

    logger.info("live_board_created", board_id=bid, jql_length=len(jql))
    return {
        "id": bid,
        "name": name,
        "jql": jql,
        "columns": columns or DEFAULT_COLUMNS,
        "pinned": False,
        "created_at": now,
        "updated_at": now,
        "profile": profile.model_dump() if hasattr(profile, "model_dump") else profile,
        "view_prefs": (
            view_prefs.model_dump() if hasattr(view_prefs, "model_dump") else view_prefs
        ),
    }


async def list_boards() -> list[dict]:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM live_boards ORDER BY pinned DESC, updated_at DESC"
        )
        rows = await cursor.fetchall()
    return [_row_to_board(r) for r in rows]


async def get_board(board_id: str) -> Optional[dict]:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM live_boards WHERE id = ?", (board_id,)
        )
        row = await cursor.fetchone()
    return _row_to_board(row) if row else None


async def update_board(
    board_id: str,
    *,
    name: Optional[str] = None,
    jql: Optional[str] = None,
    columns: Optional[list[str]] = None,
    pinned: Optional[bool] = None,
    profile: Any = None,
    view_prefs: Any = None,
) -> Optional[dict]:
    sets: list[str] = []
    params: list[Any] = []
    if name is not None:
        sets.append("name = ?")
        params.append(_validate_name(name))
    if jql is not None:
        sets.append("jql = ?")
        params.append(encrypt_value(jql))
    if columns is not None:
        sets.append("columns = ?")
        params.append(json.dumps(columns))
    if pinned is not None:
        sets.append("pinned = ?")
        params.append(1 if pinned else 0)
    if profile is not None:
        sets.append("profile = ?")
        params.append(_encrypt_profile_blob(profile))
    if view_prefs is not None:
        sets.append("view_prefs = ?")
        params.append(_encrypt_profile_blob(view_prefs))
    if not sets:
        return await get_board(board_id)
    sets.append("updated_at = ?")
    params.append(_now_iso())
    params.append(board_id)
    async with get_connection() as db:
        cursor = await db.execute(
            f"UPDATE live_boards SET {', '.join(sets)} WHERE id = ?",
            tuple(params),
        )
        await db.commit()
        if cursor.rowcount == 0:
            return None
    logger.info(
        "live_board_updated",
        board_id=board_id,
        fields=[s.split(" = ")[0] for s in sets],
    )
    return await get_board(board_id)


async def delete_board(board_id: str) -> bool:
    async with get_connection() as db:
        cursor = await db.execute(
            "DELETE FROM live_boards WHERE id = ?", (board_id,)
        )
        await db.commit()
        deleted = cursor.rowcount > 0
    if deleted:
        logger.info("live_board_deleted", board_id=board_id)
    return deleted
