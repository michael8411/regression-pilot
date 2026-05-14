"""Abstract provider adapter contracts (Phase 1 stubs)."""

from __future__ import annotations

import abc
from typing import Any, Optional

try:
    from backend.schemas.context_bundle_models import (
        CodeContext,
        DbContext,
        ExistingTests,
        TicketContext,
    )
except ImportError:  # pragma: no cover - script-mode import
    from schemas.context_bundle_models import (
        CodeContext,
        DbContext,
        ExistingTests,
        TicketContext,
    )


class AdapterUnavailable(Exception):
    """Raised when a provider is configured but cannot be reached.

    Routing must catch this and degrade gracefully; never bubble up to the
    user-facing generation endpoint.
    """

    def __init__(self, provider: str, reason: str) -> None:
        super().__init__(f"{provider}: {reason}")
        self.provider = provider
        self.reason = reason


class ProviderAdapter(abc.ABC):
    """Common adapter surface — subclasses override domain-specific fetches.

    Adapters MUST be deterministic for a fixed input: stable ordering on every
    list field, no timestamps in user-visible text, no random IDs.
    """

    name: str = "provider"

    @abc.abstractmethod
    async def health(self) -> bool:
        """Return True if the underlying provider is reachable."""


class AtlassianAdapter(ProviderAdapter):
    name = "atlassian"

    @abc.abstractmethod
    async def fetch_ticket(self, ticket_key: str) -> TicketContext: ...


class GithubAdapter(ProviderAdapter):
    name = "github"

    @abc.abstractmethod
    async def fetch_pr_context(
        self,
        *,
        repo_full_name: str,
        pr_number: int,
        max_files: int,
    ) -> CodeContext: ...


class AdoAdapter(ProviderAdapter):
    name = "ado"

    @abc.abstractmethod
    async def fetch_pr_context(
        self,
        *,
        project: str,
        repo: str,
        pr_id: int,
        max_files: int,
    ) -> CodeContext: ...


class SqlServerAdapter(ProviderAdapter):
    name = "sql_server"

    @abc.abstractmethod
    async def fetch_schema_slice(
        self,
        *,
        tables: list[str],
        include_procs: bool = False,
    ) -> DbContext: ...


class ZephyrReadAdapter(ProviderAdapter):
    name = "zephyr_read"

    @abc.abstractmethod
    async def list_existing_tests(self, ticket_key: str) -> ExistingTests: ...
