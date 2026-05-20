"""Phase 01 — Live workflow artifact CRUD.

Owns the encrypted-SQLite persistence for the three Live workflow surfaces
the redesign introduces:

    * pinned tickets        -> live_pinned_tickets
    * generated case drafts -> live_generated_cases
    * activity events       -> live_activity

Sensitive payload columns (ticket snapshots, generation instructions,
generated cases JSON, context metadata, export metadata, activity
summary/detail) are encrypted at rest via `utils.crypto.encrypt_value`
and decrypted in responses. Empty defaults round-trip cleanly so legacy
rows without an encrypted blob still produce safe payloads.

These helpers are intentionally synchronous-async at the SQL boundary
only — every callable is `async def`. They do not call into the Live
board service or anywhere else; that wiring lives in the route layer.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import structlog

try:
    from backend.db.connection import get_connection
    from backend.utils.crypto import decrypt_value, encrypt_value
    from backend.schemas.live_models import (
        LiveActivityCreate,
        LiveActivityEvent,
        LiveGeneratedCases,
        LiveGeneratedCasesCreate,
        LiveGeneratedCasesPatch,
        LivePinnedTicket,
        LivePinnedTicketUpsert,
    )
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from db.connection import get_connection
    from utils.crypto import decrypt_value, encrypt_value
    from schemas.live_models import (
        LiveActivityCreate,
        LiveActivityEvent,
        LiveGeneratedCases,
        LiveGeneratedCasesCreate,
        LiveGeneratedCasesPatch,
        LivePinnedTicket,
        LivePinnedTicketUpsert,
    )


logger = structlog.get_logger("testdeck.live_artifacts")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _enc_obj(value: Any) -> str:
    if value is None:
        return ""
    return encrypt_value(json.dumps(value, default=str))


def _dec_obj(blob: str) -> Any:
    if not blob:
        return None
    try:
        return json.loads(decrypt_value(blob))
    except Exception:
        logger.warning("live_artifact_decrypt_failed")
        return None


def _enc_text(value: str) -> str:
    if not value:
        return ""
    return encrypt_value(value)


def _dec_text(blob: str) -> str:
    if not blob:
        return ""
    try:
        return decrypt_value(blob)
    except Exception:
        logger.warning("live_artifact_text_decrypt_failed")
        return ""


# ---------------------------------------------------------------------------
# Pinned tickets
# ---------------------------------------------------------------------------


def _pinned_row(row) -> LivePinnedTicket:
    return LivePinnedTicket(
        ticket_key=row["ticket_key"],
        board_id=row["board_id"],
        ticket_snapshot=_dec_obj(row["ticket_snapshot"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def list_pinned_tickets() -> list[LivePinnedTicket]:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM live_pinned_tickets ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
    return [_pinned_row(r) for r in rows]


async def upsert_pinned_ticket(
    ticket_key: str, payload: LivePinnedTicketUpsert
) -> LivePinnedTicket:
    key = (ticket_key or "").strip()
    if not key:
        raise ValueError("ticket_key is required")

    now = _now_iso()
    snapshot_blob = _enc_obj(payload.ticket_snapshot)

    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM live_pinned_tickets WHERE ticket_key = ?", (key,)
        )
        existing = await cursor.fetchone()
        if existing is None:
            await db.execute(
                """
                INSERT INTO live_pinned_tickets
                    (ticket_key, board_id, ticket_snapshot, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (key, payload.board_id, snapshot_blob, now, now),
            )
        else:
            await db.execute(
                """
                UPDATE live_pinned_tickets
                SET board_id = ?, ticket_snapshot = ?, updated_at = ?
                WHERE ticket_key = ?
                """,
                (payload.board_id, snapshot_blob, now, key),
            )
        await db.commit()

        cursor = await db.execute(
            "SELECT * FROM live_pinned_tickets WHERE ticket_key = ?", (key,)
        )
        row = await cursor.fetchone()

    logger.info("live_pin_upserted", ticket_key=key)
    assert row is not None
    return _pinned_row(row)


async def delete_pinned_ticket(ticket_key: str) -> bool:
    async with get_connection() as db:
        cursor = await db.execute(
            "DELETE FROM live_pinned_tickets WHERE ticket_key = ?",
            (ticket_key,),
        )
        await db.commit()
        deleted = cursor.rowcount > 0
    if deleted:
        logger.info("live_pin_deleted", ticket_key=ticket_key)
    return deleted


# ---------------------------------------------------------------------------
# Generated cases
# ---------------------------------------------------------------------------


def _cases_row(row) -> LiveGeneratedCases:
    cases_raw = _dec_obj(row["cases_json"])
    cases = cases_raw if isinstance(cases_raw, list) else []
    return LiveGeneratedCases(
        id=row["id"],
        ticket_key=row["ticket_key"],
        board_id=row["board_id"],
        instructions=_dec_text(row["instructions"]),
        cases=cases,
        context_metadata=_dec_obj(row["context_metadata"]),
        export_metadata=_dec_obj(row["export_metadata"]),
        status=row["status"] or "draft",
        exported_at=row["exported_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def list_generated_cases(
    *, ticket_key: Optional[str] = None
) -> list[LiveGeneratedCases]:
    async with get_connection() as db:
        if ticket_key:
            cursor = await db.execute(
                "SELECT * FROM live_generated_cases WHERE ticket_key = ? "
                "ORDER BY updated_at DESC",
                (ticket_key,),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM live_generated_cases ORDER BY updated_at DESC"
            )
        rows = await cursor.fetchall()
    return [_cases_row(r) for r in rows]


async def get_generated_cases(case_id: str) -> Optional[LiveGeneratedCases]:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM live_generated_cases WHERE id = ?", (case_id,)
        )
        row = await cursor.fetchone()
    return _cases_row(row) if row else None


async def create_generated_cases(
    payload: LiveGeneratedCasesCreate,
) -> LiveGeneratedCases:
    cid = str(uuid.uuid4())
    now = _now_iso()
    async with get_connection() as db:
        await db.execute(
            """
            INSERT INTO live_generated_cases
                (id, ticket_key, board_id, instructions, cases_json,
                 context_metadata, export_metadata, status, exported_at,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (
                cid,
                payload.ticket_key,
                payload.board_id,
                _enc_text(payload.instructions or ""),
                _enc_obj(list(payload.cases or [])),
                _enc_obj(payload.context_metadata),
                _enc_obj(payload.export_metadata),
                payload.status,
                now,
                now,
            ),
        )
        await db.commit()
    logger.info(
        "live_generated_cases_created",
        case_id=cid,
        ticket_key=payload.ticket_key,
        count=len(payload.cases or []),
    )
    result = await get_generated_cases(cid)
    assert result is not None
    return result


async def patch_generated_cases(
    case_id: str, patch: LiveGeneratedCasesPatch
) -> Optional[LiveGeneratedCases]:
    existing = await get_generated_cases(case_id)
    if existing is None:
        return None

    sets: list[str] = []
    params: list[Any] = []
    if patch.instructions is not None:
        sets.append("instructions = ?")
        params.append(_enc_text(patch.instructions))

    # Phase 06c — `case_updates` performs a surgical per-index replacement
    # on top of the existing case list so saving one case never overwrites
    # its siblings. If both `cases` and `case_updates` are present, the
    # full-list replacement wins (callers should send only one).
    if patch.cases is not None:
        sets.append("cases_json = ?")
        params.append(_enc_obj(list(patch.cases)))
    elif patch.case_updates:
        merged = list(existing.cases or [])
        for entry in patch.case_updates:
            if 0 <= entry.index < len(merged):
                merged[entry.index] = entry.case
            else:
                raise ValueError(
                    f"case_updates index {entry.index} is out of range "
                    f"(set has {len(merged)} cases)"
                )
        sets.append("cases_json = ?")
        params.append(_enc_obj(merged))
    if patch.context_metadata is not None:
        sets.append("context_metadata = ?")
        params.append(_enc_obj(patch.context_metadata))
    if patch.export_metadata is not None:
        sets.append("export_metadata = ?")
        params.append(_enc_obj(patch.export_metadata))
    if patch.status is not None:
        sets.append("status = ?")
        params.append(patch.status)
    if patch.exported_at is not None:
        sets.append("exported_at = ?")
        params.append(patch.exported_at)

    if not sets:
        return existing

    sets.append("updated_at = ?")
    params.append(_now_iso())
    params.append(case_id)
    async with get_connection() as db:
        await db.execute(
            f"UPDATE live_generated_cases SET {', '.join(sets)} WHERE id = ?",
            tuple(params),
        )
        await db.commit()
    logger.info("live_generated_cases_patched", case_id=case_id)
    return await get_generated_cases(case_id)


async def delete_generated_cases(case_id: str) -> bool:
    async with get_connection() as db:
        cursor = await db.execute(
            "DELETE FROM live_generated_cases WHERE id = ?", (case_id,)
        )
        await db.commit()
        deleted = cursor.rowcount > 0
    if deleted:
        logger.info("live_generated_cases_deleted", case_id=case_id)
    return deleted


# ---------------------------------------------------------------------------
# Activity events
# ---------------------------------------------------------------------------


def _activity_row(row) -> LiveActivityEvent:
    return LiveActivityEvent(
        id=row["id"],
        board_id=row["board_id"],
        ticket_key=row["ticket_key"],
        kind=row["kind"],
        summary=_dec_text(row["summary"]),
        detail=_dec_text(row["detail"]),
        created_at=row["created_at"],
    )


async def list_activity(
    *, board_id: Optional[str] = None, limit: int = 100
) -> list[LiveActivityEvent]:
    bound = max(1, min(limit, 500))
    async with get_connection() as db:
        if board_id:
            cursor = await db.execute(
                "SELECT * FROM live_activity WHERE board_id = ? "
                "ORDER BY created_at DESC LIMIT ?",
                (board_id, bound),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM live_activity ORDER BY created_at DESC LIMIT ?",
                (bound,),
            )
        rows = await cursor.fetchall()
    return [_activity_row(r) for r in rows]


async def create_activity(payload: LiveActivityCreate) -> LiveActivityEvent:
    aid = str(uuid.uuid4())
    now = _now_iso()
    async with get_connection() as db:
        await db.execute(
            """
            INSERT INTO live_activity
                (id, board_id, ticket_key, kind, summary, detail, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                aid,
                payload.board_id,
                payload.ticket_key,
                payload.kind,
                _enc_text(payload.summary),
                _enc_text(payload.detail),
                now,
            ),
        )
        await db.commit()
    logger.info("live_activity_created", id=aid, kind=payload.kind)
    return LiveActivityEvent(
        id=aid,
        board_id=payload.board_id,
        ticket_key=payload.ticket_key,
        kind=payload.kind,
        summary=payload.summary,
        detail=payload.detail,
        created_at=now,
    )


async def clear_activity(*, board_id: Optional[str] = None) -> int:
    async with get_connection() as db:
        if board_id:
            cursor = await db.execute(
                "DELETE FROM live_activity WHERE board_id = ?",
                (board_id,),
            )
        else:
            cursor = await db.execute("DELETE FROM live_activity")
        await db.commit()
        n = cursor.rowcount
    logger.info("live_activity_cleared", board_id=board_id, count=n)
    return int(n or 0)
