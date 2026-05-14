"""Azure DevOps adapter stub. Concrete implementation lands in Phase 3."""

from __future__ import annotations

from .base import AdapterUnavailable, AdoAdapter

try:
    from backend.schemas.context_bundle_models import CodeContext
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import CodeContext


class AdoAdapterStub(AdoAdapter):
    async def health(self) -> bool:
        return False

    async def fetch_pr_context(
        self,
        *,
        project: str,
        repo: str,
        pr_id: int,
        max_files: int,
    ) -> CodeContext:
        raise AdapterUnavailable("ado", "not implemented in phase 1")
