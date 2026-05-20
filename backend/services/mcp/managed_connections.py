"""Managed MCP connection provisioning (Phase 18).

Testdeck-owned MCP connection records for Atlassian, GitHub, Azure DevOps,
and a local read-only SQL Server MCP server. Records have stable IDs so
the Assistant tool catalog, status UI, and tests can reference them by id.

Short-lived OAuth tokens are NOT persisted in the env blob — connection
records are stored with empty env, and runtime env is resolved per-spawn
from identity_service. See `resolve_runtime_env`.
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog

try:
    from backend.db.connection import get_connection
except ImportError:  # pragma: no cover
    from db.connection import get_connection


def _settings():
    # Lazy so test reloads of config.settings stay effective.
    try:
        from backend.config.settings import get_settings as _gs
    except ImportError:  # pragma: no cover
        from config.settings import get_settings as _gs
    return _gs()


logger = structlog.get_logger("testdeck.mcp.managed")


MANAGED_ATLASSIAN_ID = "managed-atlassian"
MANAGED_GITHUB_ID = "managed-github"
MANAGED_ADO_ID = "managed-ado"
MANAGED_SQL_SERVER_ID = "managed-sql-server"


# Provider id → spawn config and metadata. We keep this small and explicit.
MANAGED_PROVIDERS: dict[str, dict] = {
    MANAGED_ATLASSIAN_ID: {
        "provider": "atlassian",
        "name": "Atlassian (managed)",
        "command": "npx",
        "args": ["-y", "@sooperset/mcp-atlassian"],
        "transport": "stdio",
        "url": "",
        # Mark as managed-only; env keys are injected at runtime.
        "env_keys": ["JIRA_URL", "JIRA_USERNAME", "JIRA_API_TOKEN"],
        "auto_approve": [
            "jira_search",
            "jira_get_issue",
            "jira_get_project",
            "jira_get_comments",
        ],
    },
    MANAGED_GITHUB_ID: {
        "provider": "github",
        "name": "GitHub (managed)",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "transport": "stdio",
        "url": "",
        "env_keys": ["GITHUB_PERSONAL_ACCESS_TOKEN"],
        "auto_approve": [
            "get_pull_request",
            "get_issue",
            "list_pull_requests",
            "search_repositories",
            "search_code",
        ],
    },
    MANAGED_ADO_ID: {
        "provider": "ado",
        "name": "Azure DevOps (managed)",
        "command": "npx",
        "args": ["-y", "@azure-devops/mcp-server"],
        "transport": "stdio",
        "url": "",
        "env_keys": ["ADO_ORG", "ADO_ACCESS_TOKEN", "ADO_AUTH_MODE"],
        "auto_approve": [
            "get_pull_request",
            "list_pull_requests",
            "get_work_item",
            "search_work_items",
        ],
    },
    MANAGED_SQL_SERVER_ID: {
        "provider": "sql_server",
        "name": "SQL Server schema (managed, read-only)",
        "command": sys.executable,
        "args": ["-m", "backend.services.mcp_servers.sql_server_readonly_server"],
        "transport": "stdio",
        "url": "",
        "env_keys": [],
        "auto_approve": [
            "list_schemas",
            "search_tables",
            "describe_table",
            "list_relationships",
            "search_procedures",
            "get_procedure_definition",
        ],
    },
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_managed_id(conn_id: str) -> bool:
    return conn_id in MANAGED_PROVIDERS


def managed_ids() -> list[str]:
    return list(MANAGED_PROVIDERS.keys())


async def ensure_managed_connections() -> list[str]:
    """Idempotently upsert managed MCP connection records.

    Always inserts with empty env (no token persistence). Updates spawn
    command/args/auto_approve when the provider definition changes.
    Returns the list of ensured connection ids.
    """
    ensured: list[str] = []
    async with get_connection() as db:
        for cid, cfg in MANAGED_PROVIDERS.items():
            cursor = await db.execute(
                "SELECT id, command, args, auto_approve FROM mcp_connections WHERE id = ?",
                (cid,),
            )
            row = await cursor.fetchone()
            now = _now()
            args_json = json.dumps(cfg["args"])
            auto_json = ""  # auto_approve is encrypted; we keep it empty here.
            enabled = _is_provider_enabled(cfg["provider"])
            if row is None:
                await db.execute(
                    """
                    INSERT INTO mcp_connections (
                        id, name, command, args, env, enabled,
                        auto_approve, created_at, updated_at, transport, url
                    ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        cid,
                        cfg["name"],
                        cfg["command"],
                        args_json,
                        1 if enabled else 0,
                        auto_json,
                        now,
                        now,
                        cfg["transport"],
                        cfg["url"],
                    ),
                )
            else:
                await db.execute(
                    """
                    UPDATE mcp_connections
                    SET name = ?, command = ?, args = ?, enabled = ?,
                        transport = ?, url = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        cfg["name"],
                        cfg["command"],
                        args_json,
                        1 if enabled else 0,
                        cfg["transport"],
                        cfg["url"],
                        now,
                        cid,
                    ),
                )
            ensured.append(cid)
        await db.commit()

    logger.info(
        "managed_mcp_connections_ensured",
        connection_ids=ensured,
        count=len(ensured),
    )
    return ensured


def _is_provider_enabled(provider: str) -> bool:
    s = _settings()
    try:
        from backend.services.auth import identity_service
    except ImportError:  # pragma: no cover
        from services.auth import identity_service
    if provider == "atlassian":
        return bool(
            identity_service.token_present("atlassian")
            or s.jira_configured
        )
    if provider == "github":
        return bool(
            identity_service.token_present("github")
            or s.github_configured
        )
    if provider == "ado":
        return bool(
            identity_service.token_present("ado")
            or identity_service.token_present("entra")
            or s.ado_configured
        )
    if provider == "sql_server":
        return bool(s.sql_server_configured)
    return False


async def get_managed_connection_status() -> dict[str, dict]:
    """Per-provider status snapshot for the Assistant status bar.

    Returns:
      {
        "managed-github": {
          "provider": "github",
          "connection_id": "managed-github",
          "configured": bool,
          "state": "connected" | "needs_setup" | "not_configured",
        },
        ...
      }
    """
    out: dict[str, dict] = {}
    for cid, cfg in MANAGED_PROVIDERS.items():
        configured = _is_provider_enabled(cfg["provider"])
        out[cid] = {
            "provider": cfg["provider"],
            "connection_id": cid,
            "configured": configured,
            "state": "connected" if configured else "not_configured",
            "auto_approve": list(cfg["auto_approve"]),
        }
    return out


def get_managed_env_keys(connection_id: str) -> list[str]:
    cfg = MANAGED_PROVIDERS.get(connection_id)
    if not cfg:
        return []
    return list(cfg["env_keys"])


def get_managed_provider(connection_id: str) -> Optional[str]:
    cfg = MANAGED_PROVIDERS.get(connection_id)
    return cfg["provider"] if cfg else None


def get_managed_auto_approve(connection_id: str) -> list[str]:
    cfg = MANAGED_PROVIDERS.get(connection_id)
    return list(cfg["auto_approve"]) if cfg else []


async def refresh_managed_connection(provider: str) -> None:
    """No-op placeholder. Tokens are not persisted; re-resolution happens
    on the next spawn via runtime env injection."""
    logger.info("managed_mcp_refresh_requested", provider=provider)


# Note on identifier reservation: not exposing managed-* via patch/delete
# routes is enforced at the route level. Service-layer CRUD remains usable
# for tests and admin paths.
_MANAGED_ID_PREFIX = "managed-"


def is_reserved_managed_id(conn_id: str) -> bool:
    return conn_id.startswith(_MANAGED_ID_PREFIX)
