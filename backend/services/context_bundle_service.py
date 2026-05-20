"""Context broker — assembles a ContextBundle from routed adapters.

Phase 1 ships:
- the orchestration loop
- the deterministic conversion from raw ticket dict -> TicketSignals + TicketContext
- a graceful-degradation path when adapters are missing or fail

Phase 3 will plug real adapter instances in. For now, callers can pass any
mapping of provider-name -> adapter instance, and missing providers are
recorded with an error code rather than failing the request.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Mapping, Optional

try:
    from backend.schemas.context_bundle_models import (
        ContextBundle,
        LinkedIssue,
        ProviderError,
        ProviderName,
        RepoPlatform,
        TicketComment,
        TicketContext,
        TicketQualityFlags,
        ToolTrace,
    )
    from backend.services.context_routing_service import (
        RoutingPlan,
        TicketSignals,
        build_routing_plan,
    )
    from backend.services.prompt_budget_service import (
        DEFAULT_POLICY,
        BudgetPolicy,
        apply_budget,
    )
    from backend.services.provider_adapters.base import (
        AdapterUnavailable,
        AtlassianAdapter,
        AdoAdapter,
        GithubAdapter,
        SqlServerAdapter,
        ZephyrReadAdapter,
    )
    from backend.services.provider_adapters.github import parse_github_pr
    from backend.services.provider_adapters.ado import parse_ado_pr
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import (
        ContextBundle,
        LinkedIssue,
        ProviderError,
        ProviderName,
        RepoPlatform,
        TicketComment,
        TicketContext,
        TicketQualityFlags,
        ToolTrace,
    )
    from services.context_routing_service import (
        RoutingPlan,
        TicketSignals,
        build_routing_plan,
    )
    from services.prompt_budget_service import (
        DEFAULT_POLICY,
        BudgetPolicy,
        apply_budget,
    )
    from services.provider_adapters.base import (
        AdapterUnavailable,
        AtlassianAdapter,
        AdoAdapter,
        GithubAdapter,
        SqlServerAdapter,
        ZephyrReadAdapter,
    )
    from services.provider_adapters.github import parse_github_pr
    from services.provider_adapters.ado import parse_ado_pr


_MIN_DESCRIPTION_CHARS = 80

# Matches PascalCase multi-word tokens ("TimeCard", "EmployeeId") and
# standalone capitalized words of 4+ chars that look like entity names.
_PASCAL_RE = re.compile(r"\b(?:[A-Z][a-z]+){2,}|[A-Z][a-z]{3,}\b")
_SQL_STOPWORDS = frozenset(
    {
        "the", "and", "api", "backend", "bug", "fix", "error", "issue",
        "test", "case", "this", "that", "with", "from", "have", "been",
        "will", "can", "was", "are", "for", "not", "but", "should",
        "when", "then", "would", "could", "also", "any", "all", "more",
        "new", "old", "get", "set", "add", "use", "run", "see", "page",
        "user", "users", "data", "base", "item", "items", "list", "view",
        "none", "true", "false", "null", "void", "type", "name", "value",
        "create", "update", "delete", "read", "field", "table", "column",
    }
)

# Conservative HCSS-domain mapping. These are *candidates* fed to the SQL
# adapter's metadata query — they are never asserted as real table names in
# generated test cases. Keep entries small; the adapter still filters by the
# allowlist and what actually exists in sys.tables.
DOMAIN_TABLE_HINTS: dict[str, tuple[str, ...]] = {
    "pay adjustment": ("PayAdjustment", "EmployeePayAdjustment", "TimeCardPayAdjustment"),
    "payadjustment": ("PayAdjustment", "EmployeePayAdjustment", "TimeCardPayAdjustment"),
    "time card": ("TimeCard", "Timecard", "EmployeeTimeCard"),
    "timecard": ("TimeCard", "Timecard", "EmployeeTimeCard"),
    "work order": ("WorkOrder", "WorkOrders"),
    "workorder": ("WorkOrder", "WorkOrders"),
    "sync": ("Sync", "Outbox", "Inbox", "ChangeLog", "Delta"),
    "payroll": ("Payroll", "PayPeriod", "PayRate", "EmployeePay"),
    "mechanic": ("Mechanic", "Employee", "Technician"),
    "equipment": ("Equipment", "Asset", "Unit"),
}


def _domain_hints_for(text: str, labels: list[str], components: list[str]) -> list[tuple[str, str]]:
    """Return ordered (candidate_table, reason) pairs for matched domain terms.

    Matching is whole-word case-insensitive. Hyphenated label tokens like
    "TIME-CARD" are normalised so they hit the same lookup key.
    """
    haystack = text.lower()
    label_hits = " ".join(labels + components).lower().replace("-", " ")
    combined = f"{haystack} {label_hits}"
    out: list[tuple[str, str]] = []
    for term, tables in DOMAIN_TABLE_HINTS.items():
        if term in combined:
            for tbl in tables:
                out.append((tbl, f"domain_term:{term}"))
    return out


def _normalize_allowlist(raw: str) -> tuple[set[str], set[str]]:
    """Parse the table allowlist into (bare_lower, full_lower) sets."""
    parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
    bare = {p.split(".")[-1].lower() for p in parts}
    full = {p.lower() for p in parts if "." in p}
    return bare, full


def _apply_allowlist(candidates: list[str], allowlist_raw: str) -> list[str]:
    if not (allowlist_raw or "").strip():
        return candidates
    bare, full = _normalize_allowlist(allowlist_raw)
    return [c for c in candidates if c.lower() in bare or c.lower() in full]


def infer_sql_tables(ticket: Mapping, *, max_tables: int = 8) -> list[str]:
    """Deterministically extract candidate SQL table names from a ticket.

    Pulls PascalCase/CamelCase tokens from summary/description, adds
    label/component names, and adds HCSS domain-term candidates. Filters
    common words. When `sql_server_table_allowlist` is configured the
    result is filtered case-insensitively to avoid confusing diagnostics
    where the adapter later drops candidates the user excluded.
    """
    candidates, _ = infer_sql_tables_with_reasons(ticket, max_tables=max_tables)
    return candidates


def infer_sql_tables_with_reasons(
    ticket: Mapping, *, max_tables: int = 8
) -> tuple[list[str], list[str]]:
    """Like `infer_sql_tables` but also returns the reasons each candidate
    was considered. Reasons are safe to log/expose; they reference only the
    ticket term or label/component name, never raw ticket content.
    """
    text = " ".join(
        [str(ticket.get("summary") or ""), str(ticket.get("description") or "")]
    )
    labels = [str(lbl) for lbl in (ticket.get("labels") or [])]
    raw_components = ticket.get("components") or []
    components = [
        str(c.get("name") or c) if isinstance(c, Mapping) else str(c)
        for c in raw_components
    ]

    pairs: list[tuple[str, str]] = []
    for token in _PASCAL_RE.findall(text):
        if token.lower() not in _SQL_STOPWORDS:
            pairs.append((token, "token"))
    for name in labels:
        stripped = name.strip()
        if stripped and stripped.lower() not in _SQL_STOPWORDS:
            pairs.append((stripped, f"label:{stripped}"))
    for name in components:
        stripped = name.strip()
        if stripped and stripped.lower() not in _SQL_STOPWORDS:
            pairs.append((stripped, f"component:{stripped}"))
    pairs.extend(_domain_hints_for(text, labels, components))

    seen: set[str] = set()
    candidates: list[str] = []
    reasons: list[str] = []
    for cand, reason in pairs:
        key = cand.lower()
        if key in seen:
            continue
        seen.add(key)
        candidates.append(cand)
        reasons.append(reason)

    try:
        from backend.config.settings import get_settings as _gs
    except ImportError:  # pragma: no cover
        from config.settings import get_settings as _gs
    try:
        allowlist_raw = _gs().sql_server_table_allowlist or ""
    except Exception:
        allowlist_raw = ""

    if allowlist_raw.strip():
        # Filter both lists in lockstep so reasons stay aligned with candidates.
        filtered_pairs = [
            (c, r) for c, r in zip(candidates, reasons)
            if _apply_allowlist([c], allowlist_raw)
        ]
        if filtered_pairs:
            candidates, reasons = (
                [c for c, _ in filtered_pairs][:max_tables],
                [r for _, r in filtered_pairs][:max_tables],
            )
        else:
            candidates, reasons = [], []
    else:
        candidates = candidates[:max_tables]
        reasons = reasons[:max_tables]

    return candidates, reasons


@dataclass
class AdapterSet:
    """Container for the optional adapters available in the current run."""

    atlassian: Optional[AtlassianAdapter] = None
    github: Optional[GithubAdapter] = None
    ado: Optional[AdoAdapter] = None
    sql_server: Optional[SqlServerAdapter] = None
    zephyr_read: Optional[ZephyrReadAdapter] = None

    def available(self) -> list[ProviderName]:
        names: list[ProviderName] = []
        if self.atlassian is not None:
            names.append("atlassian")
        if self.github is not None:
            names.append("github")
        if self.ado is not None:
            names.append("ado")
        if self.sql_server is not None:
            names.append("sql_server")
        if self.zephyr_read is not None:
            names.append("zephyr_read")
        return names


def signals_from_ticket(ticket: Mapping) -> TicketSignals:
    """Pull just-enough fields from a raw ticket dict for routing."""
    key = str(ticket.get("key") or "").strip()
    project_key = key.split("-", 1)[0] if "-" in key else ""
    dev_links = ticket.get("development_links") or ticket.get("dev_links") or []
    if not isinstance(dev_links, (list, tuple)):
        dev_links = []
    labels = tuple(str(l) for l in (ticket.get("labels") or []))
    components = tuple(_component_name(c) for c in (ticket.get("components") or []))
    return TicketSignals(
        key=key,
        project_key=project_key,
        priority=str(ticket.get("priority") or ""),
        labels=labels,
        components=components,
        development_links=tuple(str(d) for d in dev_links),
    )


def ticket_context_from_dict(ticket: Mapping) -> TicketContext:
    """Adapt the existing ticket dict shape into a normalized TicketContext.

    Phase 1 keeps the existing call sites working: callers that already have
    a flat ticket dict can route + bundle without changing the upstream
    fetcher. Phase 3 will swap this for the AtlassianAdapter path.
    """
    key = str(ticket.get("key") or "")
    summary = str(ticket.get("summary") or "")
    description = str(ticket.get("description") or "")
    acceptance = str(ticket.get("acceptance_criteria") or "").strip()
    if acceptance and acceptance not in description:
        # Preserve AC explicitly inside description so the prompt builder
        # sees both without needing a new field.
        description = f"{description}\n\nAcceptance Criteria:\n{acceptance}".strip()

    labels = [str(l) for l in (ticket.get("labels") or [])]
    components = [_component_name(c) for c in (ticket.get("components") or [])]

    raw_comments = ticket.get("comments") or []
    comments: list[TicketComment] = []
    for c in raw_comments:
        if not isinstance(c, Mapping):
            continue
        comments.append(
            TicketComment(
                author=str(c.get("author") or ""),
                created=str(c.get("created") or ""),
                body=str(c.get("body") or ""),
            )
        )
    # Deterministic ordering by created timestamp string (stable for empty).
    comments.sort(key=lambda x: (x.created, x.author))

    linked = []
    for li in ticket.get("linked_issues") or []:
        if isinstance(li, Mapping):
            linked.append(
                LinkedIssue(
                    key=str(li.get("key") or ""),
                    relation=str(li.get("relation") or ""),
                    summary=str(li.get("summary") or ""),
                )
            )
        elif isinstance(li, str):
            linked.append(LinkedIssue(key=li))
    linked.sort(key=lambda x: x.key)

    dev_links = [str(d) for d in (ticket.get("development_links") or ticket.get("dev_links") or [])]
    dev_links.sort()

    flags = TicketQualityFlags(
        missing_description=not bool(description),
        missing_acceptance_criteria=not bool(acceptance),
        description_is_short=len(description) < _MIN_DESCRIPTION_CHARS,
        missing_dev_links=not bool(dev_links),
    )

    return TicketContext(
        key=key,
        summary=summary,
        description=description,
        issue_type=str(ticket.get("issue_type") or ""),
        priority=str(ticket.get("priority") or ""),
        labels=labels,
        components=components,
        fix_versions=[str(v) for v in (ticket.get("fix_versions") or [])],
        comments=comments,
        linked_issues=linked,
        development_links=dev_links,
        quality_flags=flags,
    )


async def build_context_bundle(
    ticket: Mapping,
    *,
    adapters: Optional[AdapterSet] = None,
    platform_mapping: Optional[dict[str, RepoPlatform]] = None,
    policy: BudgetPolicy = DEFAULT_POLICY,
) -> ContextBundle:
    """Top-level entry point.

    For Phase 1 the typical call site has:
        adapters=None  -> ticket-only mode (uses the raw dict)
        platform_mapping={}  -> no repo mapping yet
    """
    adapters = adapters or AdapterSet()
    platform_mapping = platform_mapping or {}

    signals = signals_from_ticket(ticket)
    plan = build_routing_plan(
        signals,
        platform_mapping=platform_mapping,
        available_providers=adapters.available(),
    )

    bundle = ContextBundle(ticket=ticket_context_from_dict(ticket))
    trace = ToolTrace(routing_decisions=list(plan.decisions))

    # Atlassian: prefer adapter when available, otherwise the dict-derived view.
    if adapters.atlassian is not None and _is_included(plan, "atlassian"):
        await _run_adapter(
            "atlassian",
            trace,
            lambda: adapters.atlassian.fetch_ticket(signals.key),
            assign=lambda v: setattr(bundle, "ticket", v),
        )
        # Atlassian is the source of truth — when the adapter is wired but
        # fails, callers (orchestrator) decide whether to abort. We record
        # the error in the trace; the orchestrator may inspect it.

    # Code context — github XOR ado per routing plan. Extract PR coordinates
    # from dev links so the adapter knows which PR to fetch.
    repo_provider = _repo_provider_to_call(plan)
    dev_links = list(signals.development_links)
    if repo_provider == "github" and adapters.github is not None:
        gh_coords = parse_github_pr(dev_links)
        if gh_coords is None:
            trace.providers_called.append("github")
            trace.errors.append(
                ProviderError(
                    provider="github",
                    code="development_links_unparseable",
                    message="no GitHub PR URL in development links",
                )
            )
        else:
            owner, repo, pr_number = gh_coords
            await _run_adapter(
                "github",
                trace,
                lambda: adapters.github.fetch_pr_context(
                    repo_full_name=f"{owner}/{repo}",
                    pr_number=pr_number,
                    max_files=plan.max_changed_files,
                ),
                assign=lambda v: setattr(bundle, "code_context", v),
            )
    elif repo_provider == "ado" and adapters.ado is not None:
        ado_coords = parse_ado_pr(dev_links)
        if ado_coords is None:
            trace.providers_called.append("ado")
            trace.errors.append(
                ProviderError(
                    provider="ado",
                    code="development_links_unparseable",
                    message="no Azure DevOps PR URL in development links",
                )
            )
        else:
            _org, project, repo, pr_id = ado_coords
            await _run_adapter(
                "ado",
                trace,
                lambda: adapters.ado.fetch_pr_context(
                    project=project,
                    repo=repo,
                    pr_id=pr_id,
                    max_files=plan.max_changed_files,
                ),
                assign=lambda v: setattr(bundle, "code_context", v),
            )
    else:
        # PR is inferred but the matching adapter isn't wired (e.g. GitHub
        # PR link present but no GitHub token configured). Record a clear
        # reason so the UI can prompt the user to connect the provider.
        for d in plan.decisions:
            if d.provider in ("github", "ado") and not d.included:
                reasons = set(d.reasons)
                if "pr_link_present" in reasons and "skipped_provider_unavailable" in reasons:
                    trace.errors.append(
                        ProviderError(
                            provider=d.provider,
                            code="repo_provider_not_configured",
                            message=f"{d.provider} PR detected but provider is not connected",
                        )
                    )

    if _is_included(plan, "sql_server") and adapters.sql_server is not None:
        sql_tables = infer_sql_tables(ticket)
        sql_include_procs = plan.include_full_files
        await _run_adapter(
            "sql_server",
            trace,
            lambda: adapters.sql_server.fetch_schema_slice(
                tables=sql_tables,
                include_procs=sql_include_procs,
            ),
            assign=lambda v: setattr(bundle, "db_context", v),
        )

    if _is_included(plan, "zephyr_read") and adapters.zephyr_read is not None:
        await _run_adapter(
            "zephyr_read",
            trace,
            lambda: adapters.zephyr_read.list_existing_tests(signals.key),
            assign=lambda v: setattr(bundle, "existing_tests", v),
        )

    bundle.tool_trace = trace
    return apply_budget(bundle, policy)


# --- helpers ----------------------------------------------------------------


def _is_included(plan: RoutingPlan, provider: ProviderName) -> bool:
    for d in plan.decisions:
        if d.provider == provider:
            return d.included
    return False


def _repo_provider_to_call(plan: RoutingPlan) -> Optional[ProviderName]:
    for p in ("github", "ado"):
        if _is_included(plan, p):
            return p  # type: ignore[return-value]
    return None


async def _run_adapter(
    provider: ProviderName,
    trace: ToolTrace,
    call,
    *,
    assign,
) -> None:
    """Invoke a provider call, record latency, and degrade on failure.

    Never raises — failures are appended to trace.errors. This protects the
    generation endpoint from a single provider outage taking down the
    request.
    """
    start = time.monotonic()
    trace.providers_called.append(provider)
    try:
        value = await call()
        assign(value)
    except AdapterUnavailable as exc:
        trace.errors.append(
            ProviderError(
                provider=provider,
                code=getattr(exc, "code", None) or "unavailable",
                message=exc.reason,
            )
        )
    except Exception as exc:  # defensive — provider bugs must not crash gen
        trace.errors.append(
            ProviderError(provider=provider, code="error", message=type(exc).__name__)
        )
    finally:
        trace.latency_ms[provider] = int((time.monotonic() - start) * 1000)


def _component_name(c) -> str:
    if isinstance(c, str):
        return c
    if isinstance(c, Mapping):
        return str(c.get("name") or c.get("value") or "")
    return ""
