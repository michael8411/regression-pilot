"""GitHub adapter stub. Concrete implementation lands in Phase 3."""

from __future__ import annotations

from .base import AdapterUnavailable, GithubAdapter

try:
    from backend.schemas.context_bundle_models import CodeContext
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import CodeContext


class GithubAdapterStub(GithubAdapter):
    async def health(self) -> bool:
        return False

    async def fetch_pr_context(
        self,
        *,
        repo_full_name: str,
        pr_number: int,
        max_files: int,
    ) -> CodeContext:
        raise AdapterUnavailable("github", "not implemented in phase 1")
