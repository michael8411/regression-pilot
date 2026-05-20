"""Build a small, relevant Assistant tool catalog from managed/manual MCP.

Heuristic selection: based on a user message + attached tool refs we pick
which managed providers are likely useful for the turn and emit at most
`max_tools` entries that match the existing tool-catalog shape:

    { "connection_id", "tool", "description", "inputSchema" }

Manual attached tool refs are always merged in (subject to the safety
policy). Managed provider tools are filtered through the safety allowlist.

We never log raw tool output here; only counts and selected names.
"""

from __future__ import annotations

import re
from typing import Optional

import structlog

try:
    from backend.services.mcp.managed_connections import (
        MANAGED_ATLASSIAN_ID,
        MANAGED_GITHUB_ID,
        MANAGED_ADO_ID,
        MANAGED_SQL_SERVER_ID,
        MANAGED_PROVIDERS,
        get_managed_connection_status,
    )
    from backend.services.mcp import tool_safety
    from backend.services.mcp.runtime import get_runtime
    from backend.services import mcp_connection_service as conn_svc
except ImportError:  # pragma: no cover
    from services.mcp.managed_connections import (
        MANAGED_ATLASSIAN_ID,
        MANAGED_GITHUB_ID,
        MANAGED_ADO_ID,
        MANAGED_SQL_SERVER_ID,
        MANAGED_PROVIDERS,
        get_managed_connection_status,
    )
    from services.mcp import tool_safety
    from services.mcp.runtime import get_runtime
    from services import mcp_connection_service as conn_svc


logger = structlog.get_logger("testdeck.mcp.tool_catalog")


_JIRA_HINTS = [
    r"\bjira\b",
    r"\bticket\b",
    r"\bissue\b",
    r"\bsprint\b",
    r"\bassignee\b",
    r"\bproject\b",
    r"\bstatus\b",
    r"\bconfluence\b",
]
# Ticket-key matches must preserve case to avoid grabbing lowercase tokens.
_JIRA_TICKET_KEY_RE = re.compile(r"\b[A-Z][A-Z0-9]+-\d+\b")

_CODE_HINTS = [
    r"\bpr\b",
    r"\bpull request\b",
    r"\brepo(s|sitor(y|ies))?\b",
    r"\bdiff\b",
    r"\bcommit\b",
    r"\bbranch\b",
    r"\bfile\b",
    r"\bcode\b",
    r"\breview\b",
]

_SQL_HINTS = [
    r"\bdatabase\b",
    r"\btable\b",
    r"\bcolumn\b",
    r"\bschema\b",
    r"\bstored procedure\b",
    r"\bsproc\b",
    r"\bsql\b",
    r"\bpayroll\b",
    r"\bcalculation\b",
    r"\bsync\s+data\b",
]


def _has_any(text: str, patterns: list[str]) -> bool:
    if not text:
        return False
    lo = text.lower()
    return any(re.search(p, lo) for p in patterns)


def select_providers(
    user_message: str,
    attached_tool_refs: list[dict],
) -> list[str]:
    """Return the list of managed connection ids worth consulting for
    this turn. Manual attached tools are independent of this selection."""
    out: list[str] = []
    has_ticket_key = bool(_JIRA_TICKET_KEY_RE.search(user_message or ""))
    if has_ticket_key or _has_any(user_message, _JIRA_HINTS):
        out.append(MANAGED_ATLASSIAN_ID)
    if _has_any(user_message, _CODE_HINTS):
        # We include both code hosts; the user's repo mapping context
        # disambiguates at call time. Most turns will only invoke one.
        out.append(MANAGED_GITHUB_ID)
        out.append(MANAGED_ADO_ID)
    if _has_any(user_message, _SQL_HINTS):
        out.append(MANAGED_SQL_SERVER_ID)

    # If user attached a managed provider's tool explicitly, include it.
    for ref in attached_tool_refs or []:
        cid = (ref or {}).get("connection_id") or ""
        if cid in MANAGED_PROVIDERS and cid not in out:
            out.append(cid)
    return out


async def _safe_list_tools(connection_id: str) -> list[dict]:
    try:
        return await get_runtime().list_tools(connection_id)
    except Exception as exc:
        logger.info(
            "managed_mcp_list_tools_failed",
            connection_id=connection_id,
            error_class=type(exc).__name__,
        )
        return []


def _shape_entry(connection_id: str, tool: dict) -> dict:
    return {
        "connection_id": connection_id,
        "tool": str(tool.get("name", "")),
        "description": (tool.get("description") or "")[:400],
        "inputSchema": tool.get("inputSchema") or {},
    }


async def build_assistant_tool_catalog(
    conversation_id: str,
    *,
    user_message: str,
    attached_tool_refs: Optional[list[dict]] = None,
    max_tools: int = 12,
) -> list[dict]:
    """Build the merged Assistant catalog for this conversation turn.

    - Manual attached tools are honored first (filtered by global block).
    - Managed providers selected by heuristics are added next, filtered
      by per-provider safelist.
    - Output is capped at `max_tools` to avoid prompt bloat.
    """
    attached = list(attached_tool_refs or [])
    selected_providers = select_providers(user_message, attached)
    catalog: list[dict] = []
    seen: set[tuple[str, str]] = set()
    filtered_counts = {"blocked": 0, "unsafe": 0}

    # 1. Manual attached tools — preserve order, filter unsafe ones.
    for ref in attached:
        cid = str((ref or {}).get("connection_id") or "")
        name = str((ref or {}).get("tool") or "")
        if not cid or not name:
            continue
        key = (cid, name)
        if key in seen:
            continue
        if tool_safety.is_blocked(name):
            filtered_counts["blocked"] += 1
            continue
        seen.add(key)
        catalog.append(
            {
                "connection_id": cid,
                "tool": name,
                "description": (ref or {}).get("description") or "",
                "inputSchema": (ref or {}).get("inputSchema") or {},
            }
        )

    # 2. Managed provider tools — only the ones the user message hinted at.
    for cid in selected_providers:
        tools = await _safe_list_tools(cid)
        for t in tools:
            tname = str(t.get("name", ""))
            if not tname:
                continue
            key = (cid, tname)
            if key in seen:
                continue
            if tool_safety.is_blocked(tname):
                filtered_counts["blocked"] += 1
                continue
            if not tool_safety.is_auto_catalog_safe(cid, tname):
                filtered_counts["unsafe"] += 1
                continue
            seen.add(key)
            catalog.append(_shape_entry(cid, t))
            if len(catalog) >= max_tools:
                break
        if len(catalog) >= max_tools:
            break

    logger.info(
        "assistant_tool_catalog_built",
        conversation_id=conversation_id,
        managed_providers=selected_providers,
        attached_tool_count=len(attached),
        tool_count=len(catalog),
        selected_tools=[e["tool"] for e in catalog][:max_tools],
        filtered=filtered_counts,
    )
    return catalog[:max_tools]


async def assistant_tool_status() -> dict:
    """Compact status payload for the Assistant status bar."""
    return {"providers": await get_managed_connection_status()}
