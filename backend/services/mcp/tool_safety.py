"""Conservative allow/deny policy for Assistant MCP tools (Phase 18).

Read/search/get/list tools are usually safe to expose to the Assistant
auto catalog. Anything that names a clear mutation (create/update/delete/
write/transition/merge/queue) is blocked from the auto catalog by default.
Manual MCP connections that ship dangerous tools still appear, but the
Assistant tool catalog will hide them unless explicitly attached.
"""

from __future__ import annotations

import fnmatch
from typing import Iterable

try:
    from backend.services.mcp.managed_connections import (
        MANAGED_PROVIDERS,
        get_managed_provider,
        is_managed_id,
    )
except ImportError:  # pragma: no cover
    from services.mcp.managed_connections import (
        MANAGED_PROVIDERS,
        get_managed_provider,
        is_managed_id,
    )


# Provider-scoped safelists. Wildcards use fnmatch syntax.
SAFE_TOOL_PATTERNS: dict[str, list[str]] = {
    "github": [
        "get_*",
        "list_*",
        "search_*",
        "read_*",
    ],
    "atlassian": [
        "jira_get_*",
        "jira_search*",
        "get_*",
        "search_*",
        "read_*",
        "confluence_get_*",
        "confluence_search*",
    ],
    "ado": [
        "get_*",
        "list_*",
        "search_*",
        "read_*",
    ],
    "sql_server": [
        "list_schemas",
        "search_tables",
        "describe_table",
        "list_relationships",
        "search_procedures",
        "get_procedure_definition",
    ],
}

# Global block list — matches against tool name only. Write-capable verbs
# never get into the auto catalog regardless of provider.
BLOCKED_TOOL_PATTERNS: list[str] = [
    "create_*",
    "update_*",
    "delete_*",
    "remove_*",
    "write_*",
    "transition_*",
    "merge_*",
    "queue_*",
    "trigger_*",
    "dispatch_*",
    "execute_*",
    "run_query*",
    "run_sql*",
    "exec_*",
    "drop_*",
    "alter_*",
    "set_*",
    "patch_*",
    "post_*",
    "add_*",
    "push_*",
]


def _matches_any(name: str, patterns: Iterable[str]) -> bool:
    lo = name.lower()
    return any(fnmatch.fnmatchcase(lo, p) for p in patterns)


def is_blocked(tool_name: str) -> bool:
    return _matches_any(tool_name or "", BLOCKED_TOOL_PATTERNS)


def is_safe_for_provider(provider: str, tool_name: str) -> bool:
    patterns = SAFE_TOOL_PATTERNS.get(provider)
    if not patterns:
        return False
    return _matches_any(tool_name or "", patterns)


def is_auto_catalog_safe(connection_id: str, tool_name: str) -> bool:
    """Should this tool appear in the auto-built Assistant catalog?

    Managed providers: must match the provider safelist AND not be on the
    global block list.
    Manual connections: must not be on the global block list.
    """
    if not tool_name:
        return False
    if is_blocked(tool_name):
        return False
    if is_managed_id(connection_id):
        provider = get_managed_provider(connection_id) or ""
        return is_safe_for_provider(provider, tool_name)
    return True


def classify(connection_id: str, tool_name: str) -> str:
    """Return 'safe' / 'blocked' / 'caution'."""
    if is_blocked(tool_name):
        return "blocked"
    if is_managed_id(connection_id):
        provider = get_managed_provider(connection_id) or ""
        return "safe" if is_safe_for_provider(provider, tool_name) else "caution"
    return "caution"


__all__ = [
    "SAFE_TOOL_PATTERNS",
    "BLOCKED_TOOL_PATTERNS",
    "is_blocked",
    "is_safe_for_provider",
    "is_auto_catalog_safe",
    "classify",
]
