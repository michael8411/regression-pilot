"""Atlassian adapter — Phase 3.

Given a pre-fetched raw ticket dict (the standard Jira passthrough shape used
across the app), normalize it into the TicketContext schema used by the
ContextBundle. The orchestrator passes the already-resolved ticket so we
don't duplicate a Jira round-trip the caller already paid for.
"""

from __future__ import annotations

from typing import Mapping, Optional

from .base import AdapterUnavailable, AtlassianAdapter

try:
    from backend.schemas.context_bundle_models import TicketContext
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import TicketContext


class AtlassianTicketAdapter(AtlassianAdapter):
    """Wraps an already-resolved raw ticket dict."""

    def __init__(self, ticket: Optional[Mapping] = None) -> None:
        self._ticket = ticket

    async def health(self) -> bool:
        return self._ticket is not None

    async def fetch_ticket(self, ticket_key: str) -> TicketContext:
        if self._ticket is None:
            raise AdapterUnavailable("atlassian", "no ticket payload available")
        # Lazy import keeps the adapter module load-order safe.
        try:
            from backend.services.context_bundle_service import (
                ticket_context_from_dict,
            )
        except ImportError:  # pragma: no cover
            from services.context_bundle_service import ticket_context_from_dict
        return ticket_context_from_dict(self._ticket)


# Backwards-compatible name expected by Phase 1 imports.
AtlassianAdapterStub = AtlassianTicketAdapter
