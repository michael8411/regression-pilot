"""CRUD for the project_repo_map table."""
import uuid
from datetime import datetime, timezone

import structlog

try:
    from backend.db.connection import get_connection
    from backend.schemas.project_repo_map_models import (
        ProjectRepoMap,
        ProjectRepoMapCreate,
        ProjectRepoMapUpdate,
    )
except ImportError:  # pragma: no cover
    from db.connection import get_connection
    from schemas.project_repo_map_models import (
        ProjectRepoMap,
        ProjectRepoMapCreate,
        ProjectRepoMapUpdate,
    )


logger = structlog.get_logger("testdeck.project_repo_map_service")


class DuplicateProjectError(Exception):
    pass


class MappingNotFoundError(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_model(row) -> ProjectRepoMap:
    return ProjectRepoMap(
        id=row["id"],
        jira_project=row["jira_project"],
        platform=row["platform"],
        org=row["org"] or "",
        repo=row["repo"] or "",
        ado_project=row["ado_project"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def list_mappings() -> list[ProjectRepoMap]:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM project_repo_map ORDER BY jira_project ASC"
        )
        rows = await cursor.fetchall()
    return [_row_to_model(r) for r in rows]


async def get_mapping(mapping_id: str) -> ProjectRepoMap | None:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM project_repo_map WHERE id = ?", (mapping_id,)
        )
        row = await cursor.fetchone()
    return _row_to_model(row) if row else None


async def create_mapping(req: ProjectRepoMapCreate) -> ProjectRepoMap:
    new_id = str(uuid.uuid4())
    now = _now()
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT 1 FROM project_repo_map WHERE jira_project = ?",
            (req.jira_project,),
        )
        existing = await cursor.fetchone()
        if existing:
            raise DuplicateProjectError(req.jira_project)
        await db.execute(
            """
            INSERT INTO project_repo_map
                (id, jira_project, platform, org, repo, ado_project, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                req.jira_project,
                req.platform,
                req.org,
                req.repo,
                req.ado_project,
                now,
                now,
            ),
        )
        await db.commit()
    logger.info("repo_map_created", id=new_id, jira_project=req.jira_project)
    return ProjectRepoMap(
        id=new_id,
        jira_project=req.jira_project,
        platform=req.platform,
        org=req.org,
        repo=req.repo,
        ado_project=req.ado_project,
        created_at=now,
        updated_at=now,
    )


async def update_mapping(
    mapping_id: str, req: ProjectRepoMapUpdate
) -> ProjectRepoMap:
    current = await get_mapping(mapping_id)
    if current is None:
        raise MappingNotFoundError(mapping_id)

    updates = req.model_dump(exclude_none=True)
    if not updates:
        return current

    fields = ", ".join(f"{k} = ?" for k in updates) + ", updated_at = ?"
    params = list(updates.values()) + [_now(), mapping_id]

    async with get_connection() as db:
        await db.execute(
            f"UPDATE project_repo_map SET {fields} WHERE id = ?", params
        )
        await db.commit()
    logger.info("repo_map_updated", id=mapping_id, fields=list(updates.keys()))
    updated = await get_mapping(mapping_id)
    assert updated is not None
    return updated


async def delete_mapping(mapping_id: str) -> bool:
    async with get_connection() as db:
        cursor = await db.execute(
            "DELETE FROM project_repo_map WHERE id = ?", (mapping_id,)
        )
        await db.commit()
        return cursor.rowcount > 0
