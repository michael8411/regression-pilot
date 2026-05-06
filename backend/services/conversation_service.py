import json
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional

import structlog

try:
    from backend.db.connection import get_connection
    from backend.services import ai_service
    from backend.utils.crypto import decrypt_value, encrypt_value
    from backend.utils.secret_scanner import scan_for_secrets
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from db.connection import get_connection
    from services import ai_service
    from utils.crypto import decrypt_value, encrypt_value
    from utils.secret_scanner import scan_for_secrets


logger = structlog.get_logger("testdeck.conversations")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_decrypt(blob: str, fallback: str = "") -> str:
    try:
        return decrypt_value(blob)
    except Exception:
        logger.warning("conversation_decrypt_failed")
        return fallback


def _safe_json_loads(raw: str, fallback):
    try:
        return json.loads(raw or "")
    except (json.JSONDecodeError, TypeError):
        return fallback


def _findings_to_names(findings) -> list[str]:
    if not findings:
        return []
    out: list[str] = []
    for f in findings:
        if isinstance(f, dict):
            name = f.get("pattern_name")
            if name:
                out.append(name)
    return out


def _sanitize_title(title: str) -> str:
    """Strip obvious secrets from a title before persisting in plaintext."""
    title = (title or "").strip()[:120]
    findings = scan_for_secrets(title)
    if findings:
        logger.warning(
            "conversation_title_secret_redacted",
            patterns=[f["pattern_name"] for f in findings if isinstance(f, dict)],
        )
        return "New conversation"
    return title or "New conversation"


def _row_to_conversation(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "pinned": bool(row["pinned"]),
        "archived": bool(row["archived"]),
        "meta": _safe_json_loads(row["meta"], {}),
    }


def _row_to_message(row) -> dict:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "role": row["role"],
        "content": _safe_decrypt(row["content"], "[unreadable]"),
        "created_at": row["created_at"],
        "meta": _safe_json_loads(row["meta"], {}),
    }


def _row_to_attachment(row) -> dict:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "kind": row["kind"],
        "ref": _safe_decrypt(row["ref"], ""),
        "created_at": row["created_at"],
    }


async def _conversation_exists(conversation_id: str) -> bool:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
        )
        return (await cursor.fetchone()) is not None


async def _get_conversation_only(conversation_id: str) -> Optional[dict]:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
        )
        row = await cursor.fetchone()
    return _row_to_conversation(row) if row else None


async def create_conversation(title: Optional[str] = None) -> dict:
    cid = str(uuid.uuid4())
    now = _now_iso()
    safe_title = _sanitize_title(title or "New conversation")
    async with get_connection() as db:
        await db.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at, pinned, archived, meta) "
            "VALUES (?, ?, ?, ?, 0, 0, '{}')",
            (cid, safe_title, now, now),
        )
        await db.commit()
    logger.info("conversation_created", conversation_id=cid)
    return {
        "id": cid,
        "title": safe_title,
        "created_at": now,
        "updated_at": now,
        "pinned": False,
        "archived": False,
        "meta": {},
    }


async def list_conversations(include_archived: bool = False) -> list[dict]:
    sql = "SELECT * FROM conversations"
    params: tuple = ()
    if not include_archived:
        sql += " WHERE archived = 0"
    sql += " ORDER BY pinned DESC, updated_at DESC"
    async with get_connection() as db:
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()
    return [_row_to_conversation(r) for r in rows]


async def get_conversation(conversation_id: str) -> Optional[dict]:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
        )
        convo_row = await cursor.fetchone()
        if not convo_row:
            return None
        cursor = await db.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
            (conversation_id,),
        )
        message_rows = await cursor.fetchall()
        cursor = await db.execute(
            "SELECT * FROM attachments WHERE conversation_id = ? ORDER BY created_at",
            (conversation_id,),
        )
        attachment_rows = await cursor.fetchall()

    return {
        "conversation": _row_to_conversation(convo_row),
        "messages": [_row_to_message(r) for r in message_rows],
        "attachments": [_row_to_attachment(r) for r in attachment_rows],
    }


async def update_conversation(
    conversation_id: str,
    *,
    title: Optional[str] = None,
    pinned: Optional[bool] = None,
    archived: Optional[bool] = None,
) -> Optional[dict]:
    sets: list[str] = []
    params: list[Any] = []
    if title is not None:
        sets.append("title = ?")
        params.append(_sanitize_title(title))
    if pinned is not None:
        sets.append("pinned = ?")
        params.append(1 if pinned else 0)
    if archived is not None:
        sets.append("archived = ?")
        params.append(1 if archived else 0)
    if not sets:
        return await _get_conversation_only(conversation_id)
    sets.append("updated_at = ?")
    params.append(_now_iso())
    params.append(conversation_id)
    async with get_connection() as db:
        cursor = await db.execute(
            f"UPDATE conversations SET {', '.join(sets)} WHERE id = ?",
            tuple(params),
        )
        await db.commit()
        if cursor.rowcount == 0:
            return None
    logger.info(
        "conversation_updated",
        conversation_id=conversation_id,
        fields=[s.split(" = ")[0] for s in sets],
    )
    return await _get_conversation_only(conversation_id)


async def delete_conversation(conversation_id: str) -> bool:
    async with get_connection() as db:
        cursor = await db.execute(
            "DELETE FROM conversations WHERE id = ?", (conversation_id,)
        )
        await db.commit()
        deleted = cursor.rowcount > 0
    if deleted:
        logger.info("conversation_deleted", conversation_id=conversation_id)
    return deleted


async def append_message(
    conversation_id: str,
    *,
    role: str,
    content: str,
    meta: Optional[dict[str, Any]] = None,
) -> tuple[Optional[dict], list[str]]:
    """Returns (message_dict, secret_scan_pattern_names).

    message_dict is None when the conversation does not exist.
    """
    if not await _conversation_exists(conversation_id):
        return None, []

    findings = scan_for_secrets(content)
    pattern_names = _findings_to_names(findings)
    if pattern_names:
        logger.warning(
            "conversation_message_secret_scan_hit",
            conversation_id=conversation_id,
            patterns=pattern_names,
        )

    mid = str(uuid.uuid4())
    now = _now_iso()
    encrypted_content = encrypt_value(content)
    meta_json = json.dumps(meta or {})
    async with get_connection() as db:
        await db.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at, meta) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (mid, conversation_id, role, encrypted_content, now, meta_json),
        )
        await db.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conversation_id),
        )
        await db.commit()

    logger.info(
        "conversation_message_appended",
        conversation_id=conversation_id,
        message_id=mid,
        role=role,
    )
    return (
        {
            "id": mid,
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "created_at": now,
            "meta": meta or {},
        },
        pattern_names,
    )


async def _resolve_attached_tickets(attachments: list[dict]) -> list[dict]:
    """Hydrate ticket attachments into the structure ai_service expects.

    Only `kind == 'ticket'` attachments resolve in Phase 7. Other kinds exist
    for UI context. Phase 9 (MCP) wires those.
    """
    keys = [
        a["ref"]
        for a in attachments
        if a["kind"] == "ticket" and a["ref"]
    ]
    if not keys:
        return []
    try:
        try:
            from backend.services import jira_service
        except ImportError:
            from services import jira_service
        return await jira_service.get_tickets_by_keys(keys)
    except Exception:
        logger.warning("attachment_resolve_failed", count=len(keys))
        return []


async def stream_assistant_reply(conversation_id: str) -> AsyncIterator[dict]:
    convo = await get_conversation(conversation_id)
    if not convo:
        yield {"error": "conversation not found"}
        return

    history = [
        {"role": m["role"], "content": m["content"]}
        for m in convo["messages"]
        if m["role"] in ("user", "assistant", "system")
    ]
    if not history or history[-1]["role"] != "user":
        yield {"error": "last message must be from user"}
        return

    tickets_payload = await _resolve_attached_tickets(convo["attachments"])

    accumulated = ""
    try:
        async for chunk in ai_service.stream_chat_message(history, tickets_payload):
            accumulated += chunk
            yield {"text": chunk}
    except Exception as exc:
        logger.warning(
            "conversation_stream_error",
            conversation_id=conversation_id,
            error_class=type(exc).__name__,
        )
        yield {"error": "Assistant temporarily unavailable."}
        return

    persisted, _ = await append_message(
        conversation_id, role="assistant", content=accumulated, meta={}
    )
    if persisted:
        yield {"done": True, "message_id": persisted["id"]}
    else:
        yield {"error": "conversation deleted during stream"}


async def add_attachment(
    conversation_id: str, *, kind: str, ref: str
) -> Optional[dict]:
    if not await _conversation_exists(conversation_id):
        return None
    aid = str(uuid.uuid4())
    now = _now_iso()
    encrypted_ref = encrypt_value(ref)
    async with get_connection() as db:
        await db.execute(
            "INSERT INTO attachments (id, conversation_id, kind, ref, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (aid, conversation_id, kind, encrypted_ref, now),
        )
        await db.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conversation_id),
        )
        await db.commit()
    logger.info("attachment_added", conversation_id=conversation_id, kind=kind)
    return {
        "id": aid,
        "conversation_id": conversation_id,
        "kind": kind,
        "ref": ref,
        "created_at": now,
    }


async def remove_attachment(conversation_id: str, attachment_id: str) -> bool:
    async with get_connection() as db:
        cursor = await db.execute(
            "DELETE FROM attachments WHERE id = ? AND conversation_id = ?",
            (attachment_id, conversation_id),
        )
        await db.commit()
        deleted = cursor.rowcount > 0
    if deleted:
        logger.info("attachment_removed", conversation_id=conversation_id)
    return deleted
