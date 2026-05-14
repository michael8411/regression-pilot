"""Provider adapter interfaces.

Phase 1 ships interface stubs only. Each adapter is responsible for converting
a provider's raw response into the normalized ContextBundle subsections.
Concrete fetching is implemented in Phase 3.
"""

from .base import (
    AdapterUnavailable,
    AtlassianAdapter,
    AdoAdapter,
    GithubAdapter,
    ProviderAdapter,
    SqlServerAdapter,
    ZephyrReadAdapter,
)

__all__ = [
    "AdapterUnavailable",
    "AtlassianAdapter",
    "AdoAdapter",
    "GithubAdapter",
    "ProviderAdapter",
    "SqlServerAdapter",
    "ZephyrReadAdapter",
]
