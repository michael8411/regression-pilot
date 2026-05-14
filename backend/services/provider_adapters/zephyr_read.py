"""Zephyr read adapter stub. Concrete implementation lands in Phase 3.

Zephyr is REST (not MCP). Read path runs pre-generation to dedupe; write
path runs post-generation and is out of scope for Phase 1.
"""

from __future__ import annotations

from .base import AdapterUnavailable, ZephyrReadAdapter

try:
    from backend.schemas.context_bundle_models import ExistingTests
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import ExistingTests


class ZephyrReadAdapterStub(ZephyrReadAdapter):
    async def health(self) -> bool:
        return False

    async def list_existing_tests(self, ticket_key: str) -> ExistingTests:
        raise AdapterUnavailable("zephyr_read", "not implemented in phase 1")
