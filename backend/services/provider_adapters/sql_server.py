"""SQL Server adapter stub. Concrete implementation lands in Phase 3.

Notes for Phase 3 implementers:
- Must be read-only and pointed at non-production by configuration.
- Scope queries to inferred tables/procs; never dump full schema.
"""

from __future__ import annotations

from .base import AdapterUnavailable, SqlServerAdapter

try:
    from backend.schemas.context_bundle_models import DbContext
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import DbContext


class SqlServerAdapterStub(SqlServerAdapter):
    async def health(self) -> bool:
        return False

    async def fetch_schema_slice(
        self,
        *,
        tables: list[str],
        include_procs: bool = False,
    ) -> DbContext:
        raise AdapterUnavailable("sql_server", "not implemented in phase 1")
