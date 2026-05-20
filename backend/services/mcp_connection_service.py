import json
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

import structlog

try:
    from backend.db.connection import get_connection
    from backend.utils.crypto import decrypt_value, encrypt_value
    from backend.utils.secret_scanner import scan_for_secrets
    from backend.schemas.mcp_models import (
        McpConnection,
        McpConnectionCreate,
        McpConnectionPatch,
    )
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from db.connection import get_connection
    from utils.crypto import decrypt_value, encrypt_value
    from utils.secret_scanner import scan_for_secrets
    from schemas.mcp_models import (
        McpConnection,
        McpConnectionCreate,
        McpConnectionPatch,
    )


logger = structlog.get_logger("testdeck.mcp.service")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _decrypt_dict(blob: str, label: str, conn_id: str) -> dict:
    if not blob:
        return {}
    try:
        return json.loads(decrypt_value(blob))
    except Exception:
        logger.warning(label, connection_id=conn_id)
        return {}


def _decrypt_list(blob: str, label: str, conn_id: str) -> list:
    if not blob:
        return []
    try:
        out = json.loads(decrypt_value(blob))
        return list(out) if isinstance(out, list) else []
    except Exception:
        logger.warning(label, connection_id=conn_id)
        return []


def _safe_json_loads(raw: str, fallback):
    try:
        return json.loads(raw or "")
    except (json.JSONDecodeError, TypeError):
        return fallback


def _row_to_connection(
    row,
    *,
    runtime_status: str,
    runtime_error: Optional[str],
    redact_env: bool,
) -> McpConnection:
    args = _safe_json_loads(row["args"], [])
    if not isinstance(args, list):
        args = []

    env_dict = _decrypt_dict(row["env"], "mcp_env_decrypt_failed", row["id"])
    auto_list = _decrypt_list(
        row["auto_approve"], "mcp_auto_approve_decrypt_failed", row["id"]
    )
    try:
        from backend.services.mcp.managed_connections import (
            is_managed_id,
            get_managed_auto_approve,
        )
    except ImportError:  # pragma: no cover
        from services.mcp.managed_connections import (
            is_managed_id,
            get_managed_auto_approve,
        )
    if is_managed_id(row["id"]):
        auto_list = get_managed_auto_approve(row["id"])

    # Phase 4: transport/url were added later via migration; treat them as
    # optional when reading legacy rows fetched from older schemas.
    transport = "stdio"
    url = ""
    try:
        transport = row["transport"] or "stdio"
    except (IndexError, KeyError):
        pass
    try:
        url = row["url"] or ""
    except (IndexError, KeyError):
        pass

    return McpConnection(
        id=row["id"],
        name=row["name"],
        command=row["command"],
        args=args,
        env={} if redact_env else env_dict,
        envKeys=sorted(env_dict.keys()),
        enabled=bool(row["enabled"]),
        autoApprove=[str(a) for a in auto_list],
        status=runtime_status,  # type: ignore[arg-type]
        lastError=runtime_error,
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        transport=transport,  # type: ignore[arg-type]
        url=url,
    )


RuntimeStatusFn = Callable[[str], str]
RuntimeErrorFn = Callable[[str], Optional[str]]


def _scan_payload_for_secrets(
    command: str, args: list[str], *, label: str
) -> None:
    """Run the secret scanner over command + args; log warnings, never block."""
    bag = " ".join([command, *(args or [])])
    if not bag.strip():
        return
    findings = scan_for_secrets(bag)
    if findings:
        names = [
            f["pattern_name"]
            for f in findings
            if isinstance(f, dict) and f.get("pattern_name")
        ]
        logger.warning(
            "mcp_payload_secret_detected",
            label=label,
            hit_count=len(findings),
            hit_kinds=names,
        )


async def list_connections(
    *,
    runtime_status: RuntimeStatusFn,
    runtime_errors: RuntimeErrorFn,
) -> list[McpConnection]:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM mcp_connections ORDER BY name COLLATE NOCASE"
        )
        rows = await cursor.fetchall()

    return [
        _row_to_connection(
            r,
            runtime_status=runtime_status(r["id"]),
            runtime_error=runtime_errors(r["id"]),
            redact_env=True,
        )
        for r in rows
    ]


async def get_connection_by_id(
    conn_id: str,
    *,
    runtime_status: RuntimeStatusFn,
    runtime_errors: RuntimeErrorFn,
) -> Optional[McpConnection]:
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM mcp_connections WHERE id = ?", (conn_id,)
        )
        row = await cursor.fetchone()

    if not row:
        return None
    return _row_to_connection(
        row,
        runtime_status=runtime_status(row["id"]),
        runtime_error=runtime_errors(row["id"]),
        redact_env=False,
    )


def _idle_status(_: str) -> str:
    return "idle"


def _no_error(_: str) -> Optional[str]:
    return None


async def create_connection(payload: McpConnectionCreate) -> McpConnection:
    _scan_payload_for_secrets(
        payload.command, payload.args, label="connection_create"
    )

    conn_id = str(uuid.uuid4())
    now = _now()

    env_encrypted = encrypt_value(json.dumps(payload.env)) if payload.env else ""
    auto_encrypted = (
        encrypt_value(json.dumps(payload.autoApprove)) if payload.autoApprove else ""
    )

    async with get_connection() as db:
        await db.execute(
            """
            INSERT INTO mcp_connections (
                id, name, command, args, env,
                enabled, auto_approve, created_at, updated_at,
                transport, url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                conn_id,
                payload.name,
                payload.command,
                json.dumps(payload.args),
                env_encrypted,
                1 if payload.enabled else 0,
                auto_encrypted,
                now,
                now,
                payload.transport,
                payload.url,
            ),
        )
        await db.commit()

    logger.info(
        "mcp_connection_created",
        connection_id=conn_id,
        name=payload.name,
        command_hash=hash(payload.command),
        env_key_count=len(payload.env),
        args_count=len(payload.args),
        transport=payload.transport,
    )
    fetched = await get_connection_by_id(
        conn_id, runtime_status=_idle_status, runtime_errors=_no_error
    )
    assert fetched is not None
    return fetched


async def patch_connection(
    conn_id: str, patch: McpConnectionPatch
) -> Optional[McpConnection]:
    if patch.command is not None or patch.args is not None:
        _scan_payload_for_secrets(
            patch.command or "",
            patch.args or [],
            label="connection_patch",
        )

    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM mcp_connections WHERE id = ?", (conn_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return None

        sets: list[str] = []
        params: list[Any] = []

        if patch.name is not None:
            sets.append("name = ?")
            params.append(patch.name)
        if patch.command is not None:
            sets.append("command = ?")
            params.append(patch.command)
        if patch.args is not None:
            sets.append("args = ?")
            params.append(json.dumps(patch.args))
        if patch.env is not None:
            sets.append("env = ?")
            params.append(
                encrypt_value(json.dumps(patch.env)) if patch.env else ""
            )
        if patch.enabled is not None:
            sets.append("enabled = ?")
            params.append(1 if patch.enabled else 0)
        if patch.autoApprove is not None:
            sets.append("auto_approve = ?")
            params.append(
                encrypt_value(json.dumps(patch.autoApprove))
                if patch.autoApprove
                else ""
            )
        if patch.transport is not None:
            sets.append("transport = ?")
            params.append(patch.transport)
        if patch.url is not None:
            sets.append("url = ?")
            params.append(patch.url)

        if not sets:
            return await get_connection_by_id(
                conn_id, runtime_status=_idle_status, runtime_errors=_no_error
            )

        sets.append("updated_at = ?")
        params.append(_now())
        params.append(conn_id)

        await db.execute(
            f"UPDATE mcp_connections SET {', '.join(sets)} WHERE id = ?",
            tuple(params),
        )
        await db.commit()

    logger.info("mcp_connection_patched", connection_id=conn_id)
    return await get_connection_by_id(
        conn_id, runtime_status=_idle_status, runtime_errors=_no_error
    )


async def resolve_runtime_env(conn: "McpConnection") -> dict[str, str]:
    """Phase 18 — return the env dict that should be passed to the child
    process when spawning an MCP server.

    Manual connections (`!is_managed_id`) return their stored encrypted env
    unchanged. Managed connections inject fresh provider tokens/settings
    from `identity_service` so we never persist short-lived OAuth tokens.

    Never logs raw token values; uses a short fingerprint for traceability.
    """
    try:
        from backend.services.mcp.managed_connections import (
            MANAGED_PROVIDERS,
            is_managed_id,
        )
        from backend.services.auth import identity_service
    except ImportError:  # pragma: no cover
        from services.mcp.managed_connections import (
            MANAGED_PROVIDERS,
            is_managed_id,
        )
        from services.auth import identity_service

    if not is_managed_id(conn.id):
        return dict(conn.env)

    cfg = MANAGED_PROVIDERS[conn.id]
    provider = cfg["provider"]
    env: dict[str, str] = dict(conn.env)

    if provider == "atlassian":
        tok = identity_service.get_provider_token("atlassian")
        if not tok or not tok.ok:
            raise PermissionError(f"managed_mcp_token_unavailable:{provider}")
        env["JIRA_URL"] = tok.metadata.get("site_url", "")
        env["JIRA_USERNAME"] = tok.metadata.get("username", "")
        env["JIRA_API_TOKEN"] = tok.access_token
    elif provider == "github":
        tok = identity_service.get_provider_token("github")
        if not tok or not tok.ok:
            raise PermissionError(f"managed_mcp_token_unavailable:{provider}")
        env["GITHUB_PERSONAL_ACCESS_TOKEN"] = tok.access_token
    elif provider == "ado":
        tok = identity_service.get_provider_token("ado")
        if not tok or not tok.ok:
            raise PermissionError(f"managed_mcp_token_unavailable:{provider}")
        env["ADO_ORG"] = tok.metadata.get("org", "")
        env["ADO_ACCESS_TOKEN"] = tok.access_token
        env["ADO_AUTH_MODE"] = tok.metadata.get("auth_mode", "pat")
    elif provider == "sql_server":
        # SQL MCP reads connection-string config from backend settings
        # directly; no token injection here.
        pass

    logger.info(
        "managed_mcp_token_injected",
        connection_id=conn.id,
        provider=provider,
        env_key_count=len([k for k in env if k]),
    )
    return env


async def delete_connection(conn_id: str) -> bool:
    async with get_connection() as db:
        cursor = await db.execute(
            "DELETE FROM mcp_connections WHERE id = ?", (conn_id,)
        )
        await db.commit()
        deleted = cursor.rowcount > 0
    if deleted:
        logger.info("mcp_connection_deleted", connection_id=conn_id)
    return deleted
