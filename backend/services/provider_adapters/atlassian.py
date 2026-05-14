"""Atlassian adapter stub. Concrete implementation lands in Phase 3."""

from __future__ import annotations

from .base import AtlassianAdapter, AdapterUnavailable

try:
    from backend.schemas.context_bundle_models import TicketContext
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import TicketContext


class AtlassianAdapterStub(AtlassianAdapter):
    """Placeholder. Phase 3 will wire this to the Atlassian MCP client."""

    async def health(self) -> bool:
        return False

    async def fetch_ticket(self, ticket_key: str) -> TicketContext:
        raise AdapterUnavailable("atlassian", "not implemented in phase 1")
