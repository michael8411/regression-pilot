"""Connection readiness — what the user can do right now.

This is a thin assembler over existing config/settings + managed MCP state.
It never returns tokens, connection strings, passwords, or raw env values.
The endpoint is meant for status only; expensive network probes stay on the
dedicated `/config/test-*` endpoints.
"""

from __future__ import annotations

from typing import Any

import structlog

try:
    from backend.services.auth import identity_service
    from backend.services.mcp.managed_connections import (
        MANAGED_PROVIDERS,
        get_managed_connection_status,
        is_managed_id,
    )
    from backend.db.connection import get_connection
except ImportError:  # pragma: no cover - script-mode imports
    from services.auth import identity_service
    from services.mcp.managed_connections import (
        MANAGED_PROVIDERS,
        get_managed_connection_status,
        is_managed_id,
    )
    from db.connection import get_connection


def _get_settings():
    """Lazy import so test fixtures that reload `config.settings` see the
    fresh Settings instance instead of a stale module-level reference."""
    try:
        from backend.config.settings import get_settings as _gs
    except ImportError:  # pragma: no cover
        from config.settings import get_settings as _gs
    return _gs()


logger = structlog.get_logger("testdeck.readiness")


# ---------------------------------------------------------------------------
# Provider "powers" — stable identifiers the frontend renders.
# ---------------------------------------------------------------------------

_JIRA_POWERS = ["ticket_context", "comments", "development_links", "publish_comments"]
_GITHUB_POWERS = ["github_pr_context", "assistant_github_tools"]
_ADO_POWERS = ["ado_pr_context", "assistant_ado_tools"]
_SQL_POWERS = ["database_schema_context", "assistant_sql_tools"]
_ZEPHYR_POWERS = ["existing_test_lookup", "publish"]
_GEMINI_POWERS = ["generation", "assistant_chat"]


# ---------------------------------------------------------------------------
# Per-provider auth_mode resolution
# ---------------------------------------------------------------------------


def _provider_auth_mode(provider: str, settings) -> str:
    """Return one of: oauth, manual, connection_string, none.

    SQL Server uses `connection_string`. Everything else prefers OAuth when an
    access token exists, then falls back to manual/PAT.
    """
    if provider == "sql_server":
        return "connection_string" if settings.sql_server_configured else "none"

    try:
        token = identity_service.get_oauth_access_token(provider)
    except Exception:
        token = None
    if token:
        return "oauth"

    if provider == "jira" and settings.jira_configured:
        return "manual"
    if provider == "github" and settings.github_configured:
        return "manual"
    if provider == "ado" and settings.ado_configured:
        return "manual"
    if provider == "zephyr" and settings.zephyr_api_token:
        return "manual"
    if provider == "gemini" and settings.gemini_api_key:
        return "manual"
    return "none"


# ---------------------------------------------------------------------------
# OAuth section
# ---------------------------------------------------------------------------


def _oauth_readiness(settings) -> dict:
    missing = list(settings.missing_oauth_settings())
    configured = not missing
    if configured:
        message = "HCSS sign-in is set up. Users can sign in to connect Jira, GitHub, and ADO with one click."
    else:
        message = (
            "HCSS sign-in is not set up yet. "
            "Use Manual Setup until IT provides OAuth app registration values."
        )
    return {
        "configured": configured,
        "usable_for_signin": configured,
        "missing_settings": missing,
        "message": message,
    }


# ---------------------------------------------------------------------------
# Provider summary used by Live + Regression sections
# ---------------------------------------------------------------------------


def _provider_summary(provider: str, settings) -> dict[str, Any]:
    auth_mode = _provider_auth_mode(provider, settings)

    if provider == "jira":
        configured = bool(settings.jira_configured) or auth_mode == "oauth"
        return {
            "configured": configured,
            "usable": configured,
            "auth_mode": auth_mode,
            "powers": _JIRA_POWERS,
            "message": (
                "Jira is connected."
                if configured
                else "Jira is required for Live Testing. Connect Jira to enable ticket context."
            ),
        }
    if provider == "github":
        configured = bool(settings.github_configured) or auth_mode == "oauth"
        return {
            "configured": configured,
            "usable": configured,
            "auth_mode": auth_mode,
            "powers": _GITHUB_POWERS,
            "message": (
                "GitHub PR context is available when Jira exposes a GitHub PR link."
                if configured
                else "GitHub is optional. Connect it to include PR diffs when Jira links one."
            ),
        }
    if provider == "ado":
        configured = bool(settings.ado_configured) or auth_mode == "oauth"
        return {
            "configured": configured,
            "usable": configured,
            "auth_mode": auth_mode,
            "powers": _ADO_POWERS,
            "message": (
                "Azure DevOps PR context is available when Jira links an ADO PR."
                if configured
                else "Azure DevOps is optional. Connect it to include PR context for ADO-linked tickets."
            ),
        }
    if provider == "sql_server":
        configured = bool(settings.sql_server_configured)
        return {
            "configured": configured,
            "usable": configured,
            "auth_mode": auth_mode,
            "powers": _SQL_POWERS,
            "message": (
                "SQL schema context is available for backend/database tickets."
                if configured
                else "SQL Server is optional. Connect it to add schema context for backend/database tickets."
            ),
        }
    if provider == "zephyr":
        configured = bool(settings.zephyr_api_token)
        return {
            "configured": configured,
            "usable": configured,
            "auth_mode": auth_mode,
            "powers": _ZEPHYR_POWERS,
            "message": (
                "Zephyr is connected. Existing test lookups and publish flows are available."
                if configured
                else "Zephyr is optional. Connect it to look up existing tests and publish."
            ),
        }
    if provider == "gemini":
        configured = bool(settings.gemini_api_key)
        return {
            "configured": configured,
            "usable": configured,
            "auth_mode": auth_mode,
            "powers": _GEMINI_POWERS,
            "message": (
                "Gemini is connected." if configured else "Gemini API key is required for generation."
            ),
        }
    return {
        "configured": False,
        "usable": False,
        "auth_mode": "none",
        "powers": [],
        "message": "",
    }


# ---------------------------------------------------------------------------
# Live + Regression
# ---------------------------------------------------------------------------


def _aggregate_state(jira_ready: bool, optional_used: int) -> str:
    """Live/Regression are 'ready' if Jira is connected; 'partial' if Jira
    only; 'not_ready' if Jira is missing. SQL/Zephyr/etc. don't make it
    not_ready, but their absence makes the readiness `partial`.
    """
    if not jira_ready:
        return "not_ready"
    if optional_used >= 1:
        return "ready"
    return "partial"


def _live_readiness(settings) -> dict:
    providers = {
        "jira": _provider_summary("jira", settings),
        "github": _provider_summary("github", settings),
        "ado": _provider_summary("ado", settings),
        "sql_server": _provider_summary("sql_server", settings),
        "zephyr": _provider_summary("zephyr", settings),
        "gemini": _provider_summary("gemini", settings),
    }
    jira_ready = providers["jira"]["usable"]
    optional_used = sum(
        1 for k in ("github", "ado", "sql_server", "zephyr") if providers[k]["usable"]
    )
    state = _aggregate_state(jira_ready, optional_used)

    if not jira_ready:
        summary = "Jira is required for Live Testing. Connect Jira to enable ticket context."
    elif state == "ready":
        summary = "Live generation can use Jira ticket context plus PR/SQL/Zephyr where available."
    else:
        summary = (
            "Live generation can use Jira ticket context. "
            "Connect GitHub, ADO, SQL Server, or Zephyr to add more context per ticket."
        )

    return {"state": state, "summary": summary, "providers": providers}


def _regression_readiness(settings) -> dict:
    # Regression uses the same REST/direct adapter set as Live; the summary
    # framing is just slightly different.
    providers = {
        "jira": _provider_summary("jira", settings),
        "github": _provider_summary("github", settings),
        "ado": _provider_summary("ado", settings),
        "sql_server": _provider_summary("sql_server", settings),
        "zephyr": _provider_summary("zephyr", settings),
    }
    jira_ready = providers["jira"]["usable"]
    optional_used = sum(
        1 for k in ("github", "ado", "sql_server", "zephyr") if providers[k]["usable"]
    )
    state = _aggregate_state(jira_ready, optional_used)

    if not jira_ready:
        summary = "Regression needs Jira connected to pull ticket context."
    elif state == "ready":
        summary = "Regression can use Jira/PR/SQL/Zephyr context where each provider is configured."
    else:
        summary = "Regression can use Jira ticket context. Add GitHub/ADO/SQL/Zephyr for richer context."

    return {"state": state, "summary": summary, "providers": providers}


# ---------------------------------------------------------------------------
# Assistant MCP
# ---------------------------------------------------------------------------


_PROVIDER_MCP_MESSAGES = {
    "atlassian": (
        "Jira MCP tools are available for Assistant.",
        "Connect Jira to enable Atlassian MCP tools.",
    ),
    "github": (
        "GitHub MCP tools are available for Assistant.",
        "Connect GitHub to enable GitHub MCP tools.",
    ),
    "ado": (
        "Azure DevOps MCP tools are available for Assistant.",
        "Connect Azure DevOps to enable ADO MCP tools.",
    ),
    "sql_server": (
        "SQL Server MCP tools are available for Assistant.",
        "Connect SQL Server to enable SQL MCP tools.",
    ),
}


async def _count_manual_mcp_connections() -> int:
    """Manual connections = rows in mcp_connections that aren't managed.

    Cheap SQL count — does not boot the MCP runtime.
    """
    try:
        async with get_connection() as db:
            cursor = await db.execute("SELECT id FROM mcp_connections")
            rows = await cursor.fetchall()
        return sum(1 for r in rows if not is_managed_id(r["id"]))
    except Exception:
        # Readiness should never fail because the DB is being initialized.
        return 0


async def _assistant_mcp_readiness(settings) -> dict:
    try:
        provider_status = await get_managed_connection_status()
    except Exception:
        provider_status = {}

    managed: dict[str, dict] = {}
    connected_count = 0
    for cid, info in provider_status.items():
        provider = info.get("provider", "")
        state = info.get("state", "not_configured")
        ok_msg, missing_msg = _PROVIDER_MCP_MESSAGES.get(
            provider, ("MCP tools available.", "Provider not configured.")
        )
        managed[cid] = {
            "provider": provider,
            "configured": bool(info.get("configured")),
            "state": state,
            "message": ok_msg if state == "connected" else missing_msg,
        }
        if state == "connected":
            connected_count += 1

    manual_count = await _count_manual_mcp_connections()

    if connected_count == 0 and manual_count == 0:
        state = "not_ready"
        summary = (
            "Assistant tools need setup. Connect Jira, GitHub, ADO, or SQL Server, "
            "or add a manual MCP connection."
        )
    elif connected_count >= len(MANAGED_PROVIDERS):
        state = "ready"
        summary = "Assistant can use managed MCP tools for all supported providers."
    else:
        state = "partial"
        summary = (
            "Assistant has some MCP tools. Connect more providers to expand "
            "what the Assistant can do."
        )

    return {
        "state": state,
        "summary": summary,
        "managed_connections": managed,
        "manual_connections_count": manual_count,
    }


# ---------------------------------------------------------------------------
# Top-level
# ---------------------------------------------------------------------------


async def get_readiness() -> dict:
    """Assemble the readiness response. Never raises."""
    settings = _get_settings()
    return {
        "oauth": _oauth_readiness(settings),
        "live_generation": _live_readiness(settings),
        "regression": _regression_readiness(settings),
        "assistant_mcp": await _assistant_mcp_readiness(settings),
    }
