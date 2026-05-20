"""Provider adapter interfaces and concrete implementations.

The abstract surface lives in `base`; concrete adapters in their domain
module. Adapters convert provider-specific payloads into the normalized
ContextBundle subsections — no raw provider responses leak past this
layer.
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
from .atlassian import AtlassianTicketAdapter
from .github import GithubRestAdapter, parse_github_pr
from .ado import AdoRestAdapter, parse_ado_pr
from .sql_server import SqlServerRestAdapter, SqlServerStubAdapter
from .zephyr_read import ZephyrRestReadAdapter

__all__ = [
    "AdapterUnavailable",
    "AtlassianAdapter",
    "AtlassianTicketAdapter",
    "AdoAdapter",
    "AdoRestAdapter",
    "GithubAdapter",
    "GithubRestAdapter",
    "ProviderAdapter",
    "SqlServerAdapter",
    "SqlServerRestAdapter",
    "SqlServerStubAdapter",
    "ZephyrReadAdapter",
    "ZephyrRestReadAdapter",
    "parse_github_pr",
    "parse_ado_pr",
]
