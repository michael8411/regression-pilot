"""SQL Server adapter — Phase 3.

We do not yet have a concrete SQL Server provider in this codebase; the
SQL MCP integration lands in a follow-up. The adapter is implemented as
an unavailable provider so the orchestrator records a graceful skip in
the tool trace without aborting generation.

When a concrete MCP/REST integration arrives, replace `_fetch` and keep
the rest of the surface the same.
"""

from __future__ import annotations

from .base import AdapterUnavailable, SqlServerAdapter

try:
    from backend.schemas.context_bundle_models import DbContext
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import DbContext


class SqlServerStubAdapter(SqlServerAdapter):
    """Unavailable provider — Phase 3 placeholder for SQL MCP/REST hookup."""

    async def health(self) -> bool:
        return False

    async def fetch_schema_slice(
        self,
        *,
        tables: list[str],
        include_procs: bool = False,
    ) -> DbContext:
        raise AdapterUnavailable("sql_server", "sql server provider not configured")


SqlServerAdapterStub = SqlServerStubAdapter
