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


_MIN_DESCRIPTION_CHARS = 80


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

    # Code context — github XOR ado per routing plan.
    repo_provider = _repo_provider_to_call(plan)
    if repo_provider == "github" and adapters.github is not None:
        await _run_adapter(
            "github",
            trace,
            lambda: adapters.github.fetch_pr_context(
                repo_full_name="",  # adapter resolves from mapping in Phase 3
                pr_number=0,
                max_files=plan.max_changed_files,
            ),
            assign=lambda v: setattr(bundle, "code_context", v),
        )
    elif repo_provider == "ado" and adapters.ado is not None:
        await _run_adapter(
            "ado",
            trace,
            lambda: adapters.ado.fetch_pr_context(
                project="",
                repo="",
                pr_id=0,
                max_files=plan.max_changed_files,
            ),
            assign=lambda v: setattr(bundle, "code_context", v),
        )

    if _is_included(plan, "sql_server") and adapters.sql_server is not None:
        await _run_adapter(
            "sql_server",
            trace,
            lambda: adapters.sql_server.fetch_schema_slice(
                tables=[],
                include_procs=plan.include_full_files,
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
            ProviderError(provider=provider, code="unavailable", message=exc.reason)
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
