import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog

try:
    from backend.db.connection import get_connection
    from backend.utils.secret_scanner import scan_for_secrets
    from backend.services import session_service
    from backend.schemas.cycle_models import (
        Cycle,
        CycleCreate,
        CyclePatch,
        CycleRun,
        CycleRunPatch,
        CycleSummary,
        ThemeSpec,
    )
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from db.connection import get_connection
    from utils.secret_scanner import scan_for_secrets
    from services import session_service
    from schemas.cycle_models import (
        Cycle,
        CycleCreate,
        CyclePatch,
        CycleRun,
        CycleRunPatch,
        CycleSummary,
        ThemeSpec,
    )


logger = structlog.get_logger("testdeck.cycles")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_json_loads(raw: str, fallback):
    try:
        return json.loads(raw or "")
    except (json.JSONDecodeError, TypeError):
        return fallback


def _row_to_summary(row) -> CycleSummary:
    return CycleSummary(
        id=row["id"],
        name=row["name"],
        projectKey=row["project_key"],
        versionHint=row["version_hint"] or "",
        ticketCount=len(_safe_json_loads(row["ticket_keys"], [])),
        themeCount=len(_safe_json_loads(row["themes"], [])),
        pinned=bool(row["pinned"]),
        archived=bool(row["archived"]),
        lastRunAt=row["last_run_at"],
        runCount=int(row["run_count"] or 0),
        updatedAt=row["updated_at"],
    )


def _row_to_cycle(row) -> Cycle:
    base = _row_to_summary(row).model_dump()
    themes_raw = _safe_json_loads(row["themes"], [])
    themes: list[ThemeSpec] = []
    for t in themes_raw:
        if isinstance(t, dict):
            try:
                themes.append(ThemeSpec(**t))
            except Exception:
                continue
    return Cycle(
        **base,
        description=row["description"] or "",
        ticketKeys=_safe_json_loads(row["ticket_keys"], []),
        themes=themes,
        testCaseRefs=_safe_json_loads(row["test_case_refs"], []),
        createdAt=row["created_at"],
    )


async def list_cycles(*, include_archived: bool = False) -> list[CycleSummary]:
    where = "" if include_archived else "WHERE archived = 0"
    async with get_connection() as db:
        cur = await db.execute(
            f"SELECT * FROM test_cycles {where} "
            "ORDER BY pinned DESC, updated_at DESC"
        )
        rows = await cur.fetchall()
    return [_row_to_summary(r) for r in rows]


async def get_cycle(cycle_id: str) -> Optional[Cycle]:
    async with get_connection() as db:
        cur = await db.execute(
            "SELECT * FROM test_cycles WHERE id = ?", (cycle_id,)
        )
        row = await cur.fetchone()
    return _row_to_cycle(row) if row else None


async def create_cycle(payload: CycleCreate) -> Cycle:
    _scan_user_text(payload.description, [t.label for t in payload.themes])

    cid = str(uuid.uuid4())
    now = _now()
    async with get_connection() as db:
        await db.execute(
            """
            INSERT INTO test_cycles (
                id, name, description, project_key, version_hint,
                ticket_keys, themes, test_case_refs,
                pinned, archived, run_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
            """,
            (
                cid,
                payload.name,
                payload.description,
                payload.projectKey,
                payload.versionHint,
                json.dumps(payload.ticketKeys),
                json.dumps([t.model_dump() for t in payload.themes]),
                json.dumps(payload.testCaseRefs),
                1 if payload.pinned else 0,
                now,
                now,
            ),
        )
        await db.commit()
    logger.info(
        "cycle_created",
        cycle_id=cid,
        project=payload.projectKey,
        ticket_count=len(payload.ticketKeys),
        theme_count=len(payload.themes),
    )
    cycle = await get_cycle(cid)
    assert cycle is not None
    return cycle


async def patch_cycle(cycle_id: str, patch: CyclePatch) -> Optional[Cycle]:
    if patch.description is not None or patch.themes is not None:
        labels = [t.label for t in (patch.themes or [])]
        _scan_user_text(patch.description or "", labels)

    sets: list[str] = []
    params: list = []
    if patch.name is not None:
        sets.append("name = ?")
        params.append(patch.name)
    if patch.description is not None:
        sets.append("description = ?")
        params.append(patch.description)
    if patch.versionHint is not None:
        sets.append("version_hint = ?")
        params.append(patch.versionHint)
    if patch.ticketKeys is not None:
        sets.append("ticket_keys = ?")
        params.append(json.dumps(patch.ticketKeys))
    if patch.themes is not None:
        sets.append("themes = ?")
        params.append(json.dumps([t.model_dump() for t in patch.themes]))
    if patch.testCaseRefs is not None:
        sets.append("test_case_refs = ?")
        params.append(json.dumps(patch.testCaseRefs))
    if patch.pinned is not None:
        sets.append("pinned = ?")
        params.append(1 if patch.pinned else 0)
    if patch.archived is not None:
        sets.append("archived = ?")
        params.append(1 if patch.archived else 0)

    if not sets:
        return await get_cycle(cycle_id)

    sets.append("updated_at = ?")
    params.append(_now())
    params.append(cycle_id)

    async with get_connection() as db:
        cur = await db.execute(
            f"UPDATE test_cycles SET {', '.join(sets)} WHERE id = ?", params
        )
        await db.commit()
        if cur.rowcount == 0:
            return None

    logger.info("cycle_patched", cycle_id=cycle_id)
    return await get_cycle(cycle_id)


async def delete_cycle(cycle_id: str) -> bool:
    async with get_connection() as db:
        cur = await db.execute(
            "DELETE FROM test_cycles WHERE id = ?", (cycle_id,)
        )
        await db.commit()
        deleted = cur.rowcount > 0
    if deleted:
        logger.info("cycle_deleted", cycle_id=cycle_id)
    return deleted


async def duplicate_cycle(cycle_id: str) -> Optional[Cycle]:
    src = await get_cycle(cycle_id)
    if not src:
        return None
    return await create_cycle(
        CycleCreate(
            name=f"{src.name} (copy)",
            description=src.description,
            projectKey=src.projectKey,
            versionHint=src.versionHint,
            ticketKeys=src.ticketKeys,
            themes=src.themes,
            testCaseRefs=src.testCaseRefs,
            pinned=False,
        )
    )


def _ticket_stub(key: str) -> dict:
    """Minimal JiraTicket-shaped stub written into session_state.

    The workbench (Phase 4 SelectView/TicketWorkbench) reads `selectedTickets`
    and re-fetches full ticket bodies from Jira. Stubs preserve the key list
    so the workbench can hydrate without losing the cycle's ordering.
    """
    return {
        "key": key,
        "id": "",
        "summary": "",
        "status": "",
        "issue_type": "",
        "priority": "",
        "assignee": "",
        "reporter": "",
        "labels": [],
        "components": [],
        "fix_versions": [],
        "resolution": "",
        "created": "",
        "updated": "",
        "description": "",
        "comments": [],
    }


async def run_cycle(
    cycle_id: str, *, session_name: Optional[str]
) -> Optional[CycleRun]:
    cycle = await get_cycle(cycle_id)
    if not cycle:
        return None

    run_id = str(uuid.uuid4())
    started = _now()

    async with get_connection() as db:
        await db.execute(
            """
            INSERT INTO cycle_runs (id, cycle_id, started_at, status)
            VALUES (?, ?, ?, 'started')
            """,
            (run_id, cycle_id, started),
        )
        await db.commit()

    # Create a fresh session and hydrate workbench state.
    session = await session_service.create_session(
        cycle.projectKey,
        session_name or cycle.versionHint or None,
    )
    session_id = session["id"]

    ticket_stubs = [_ticket_stub(k) for k in cycle.ticketKeys]

    # Theme grouping shape used by the workbench: {label: [ticketStubs...]}
    editable_groups: dict[str, list[dict]] = {}
    for t in cycle.themes:
        members = [_ticket_stub(k) for k in t.ticketKeys]
        editable_groups[t.label] = members

    # Use the actual session_service.save_state signature (key, value).
    await session_service.save_state(session_id, "selectedTickets", ticket_stubs)
    await session_service.save_state(session_id, "editableGroups", editable_groups)
    await session_service.save_state(session_id, "projectKey", cycle.projectKey)
    await session_service.save_state(session_id, "cycle_id", cycle_id)
    await session_service.save_state(session_id, "cycle_ticket_keys", cycle.ticketKeys)
    if cycle.testCaseRefs:
        await session_service.save_state(
            session_id, "cycle_test_case_refs", cycle.testCaseRefs
        )

    now = _now()
    async with get_connection() as db:
        await db.execute(
            """
            UPDATE cycle_runs
               SET session_id = ?, status = 'session_created'
             WHERE id = ?
            """,
            (session_id, run_id),
        )
        await db.execute(
            """
            UPDATE test_cycles
               SET last_run_at = ?, last_run_id = ?, run_count = run_count + 1,
                   updated_at = ?
             WHERE id = ?
            """,
            (now, run_id, now, cycle_id),
        )
        await db.commit()

    logger.info(
        "cycle_run_started",
        cycle_id=cycle_id,
        run_id=run_id,
        session_id=session_id,
        ticket_count=len(cycle.ticketKeys),
        theme_count=len(cycle.themes),
    )

    return CycleRun(
        id=run_id,
        cycleId=cycle_id,
        sessionId=session_id,
        startedAt=started,
        finishedAt=None,
        status="session_created",
        notes="",
    )


async def list_runs(cycle_id: str, *, limit: int = 50) -> list[CycleRun]:
    async with get_connection() as db:
        cur = await db.execute(
            """
            SELECT id, cycle_id, session_id, started_at, finished_at, status, notes
              FROM cycle_runs
             WHERE cycle_id = ?
             ORDER BY started_at DESC
             LIMIT ?
            """,
            (cycle_id, limit),
        )
        rows = await cur.fetchall()
    return [
        CycleRun(
            id=r["id"],
            cycleId=r["cycle_id"],
            sessionId=r["session_id"],
            startedAt=r["started_at"],
            finishedAt=r["finished_at"],
            status=r["status"],
            notes=r["notes"] or "",
        )
        for r in rows
    ]


async def patch_run(
    cycle_id: str, run_id: str, patch: CycleRunPatch
) -> Optional[CycleRun]:
    sets: list[str] = []
    params: list = []
    if patch.status is not None:
        sets.append("status = ?")
        params.append(patch.status)
    if patch.finishedAt is not None:
        sets.append("finished_at = ?")
        params.append(patch.finishedAt)
    if patch.notes is not None:
        sets.append("notes = ?")
        params.append(patch.notes)
    if not sets:
        return None
    params.extend([run_id, cycle_id])
    async with get_connection() as db:
        cur = await db.execute(
            f"UPDATE cycle_runs SET {', '.join(sets)} "
            "WHERE id = ? AND cycle_id = ?",
            params,
        )
        await db.commit()
        if cur.rowcount == 0:
            return None
        cur = await db.execute(
            "SELECT * FROM cycle_runs WHERE id = ?", (run_id,)
        )
        row = await cur.fetchone()
    return CycleRun(
        id=row["id"],
        cycleId=row["cycle_id"],
        sessionId=row["session_id"],
        startedAt=row["started_at"],
        finishedAt=row["finished_at"],
        status=row["status"],
        notes=row["notes"] or "",
    )


def _scan_user_text(description: str, theme_labels: list[str]) -> None:
    bag = "\n".join([description, *theme_labels])
    if not bag.strip():
        return
    findings = scan_for_secrets(bag)
    if findings:
        names = [
            f.get("pattern_name")
            for f in findings
            if isinstance(f, dict) and f.get("pattern_name")
        ]
        logger.warning(
            "cycle_user_text_secret_detected",
            hit_count=len(findings),
            hit_kinds=names,
        )
