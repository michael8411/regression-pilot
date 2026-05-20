"""Deterministic routing for context broker (Phase 1).

Given a ticket signal set + project/platform mapping, decide which providers
to call and at what depth. Pure function — no I/O. The returned RoutingPlan
is the *only* thing context_bundle_service uses to dispatch adapters.

Determinism rules:
- Providers in `included` are sorted in canonical order.
- Each decision records the reason codes that fired, sorted alphabetically.
- The same input ALWAYS produces byte-identical output (used by golden tests).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

try:
    from backend.schemas.context_bundle_models import (
        ProviderName,
        RepoPlatform,
        RoutingDecision,
        RoutingReasonCode,
    )
    from backend.services.dev_link_parser import infer_platform_from_links
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import (
        ProviderName,
        RepoPlatform,
        RoutingDecision,
        RoutingReasonCode,
    )
    from services.dev_link_parser import infer_platform_from_links


# Canonical provider order — used everywhere we serialize routing output.
PROVIDER_ORDER: tuple[ProviderName, ...] = (
    "atlassian",
    "github",
    "ado",
    "sql_server",
    "zephyr_read",
)


# Labels (case-insensitive, exact match after upper-casing) that signal a
# DB/server-side angle and pull SQL Server context in.
DB_SIGNAL_LABELS: frozenset[str] = frozenset(
    {
        "SERVER-SIDE",
        "API",
        "BACKEND",
        "DATABASE",
        "MIGRATION",
        "SCHEMA",
        "SYNC",
        "OFFLINE-SYNC",
        "PAYROLL",
        "CALCULATION",
    }
)

# Components are treated with the same matrix as labels for db routing.
DB_SIGNAL_COMPONENTS: frozenset[str] = frozenset(
    {
        "BACKEND",
        "DATABASE",
        "SQL",
        "PAYROLL",
        "SYNC",
    }
)


_PR_HINT_RE = re.compile(
    r"""
    (?:github\.com/[^\s/]+/[^\s/]+/pull/\d+)   # github PR URL
    |
    (?:dev\.azure\.com/[^\s]+/_git/[^\s]+/pullrequest/\d+)  # ADO PR URL
    |
    (?:visualstudio\.com/[^\s]+/_git/[^\s]+/pullrequest/\d+)
    """,
    re.IGNORECASE | re.VERBOSE,
)


@dataclass(frozen=True)
class TicketSignals:
    """Just the routing-relevant fields. Decouples routing from adapters."""

    key: str
    project_key: str
    priority: str = ""
    labels: tuple[str, ...] = ()
    components: tuple[str, ...] = ()
    development_links: tuple[str, ...] = ()  # raw dev link strings from Jira

    def normalized_labels(self) -> set[str]:
        return {l.strip().upper() for l in self.labels if l}

    def normalized_components(self) -> set[str]:
        return {c.strip().upper() for c in self.components if c}

    def has_pr_link(self) -> bool:
        for link in self.development_links:
            if link and _PR_HINT_RE.search(link):
                return True
        return False


@dataclass
class RoutingPlan:
    """Final routing decision. Pass this to context_bundle_service."""

    decisions: list[RoutingDecision] = field(default_factory=list)
    platform: RepoPlatform = "none"
    include_full_files: bool = False  # critical / regression escalation
    max_changed_files: int = 5

    @property
    def included_providers(self) -> list[ProviderName]:
        return [d.provider for d in self.decisions if d.included]


def project_platform_for(
    project_key: str,
    mapping: dict[str, RepoPlatform],
) -> RepoPlatform:
    """Look up project→platform from the repo mapping table.

    Returns "none" if no mapping is configured. Phase 2 wires the mapping
    table; Phase 1 treats it as a plain dict so unit tests are trivial.
    """
    if not project_key:
        return "none"
    return mapping.get(project_key.upper(), "none")


def _priority_depth(priority: str) -> str:
    p = (priority or "").strip().lower()
    if p in {"highest", "critical", "blocker"}:
        return "critical"
    if p == "high":
        return "high"
    if p == "low":
        return "low"
    return "medium"


def build_routing_plan(
    signals: TicketSignals,
    *,
    platform_mapping: dict[str, RepoPlatform],
    available_providers: Optional[Iterable[ProviderName]] = None,
) -> RoutingPlan:
    """Compute the deterministic routing plan for a ticket.

    Args:
        signals: ticket-derived routing signals.
        platform_mapping: project_key (upper) -> "github" | "ado" | "none".
        available_providers: which providers are configured/healthy. If None,
            all providers are considered available (routing decides inclusion
            on signal grounds only). Missing providers are still recorded as
            decisions with skipped_provider_unavailable.

    Returns:
        RoutingPlan with one RoutingDecision per provider in canonical order.
    """
    available = (
        set(available_providers)
        if available_providers is not None
        else set(PROVIDER_ORDER)
    )

    labels = signals.normalized_labels()
    components = signals.normalized_components()
    priority_bucket = _priority_depth(signals.priority)
    has_regression_label = "REGRESSION-CANDIDATE" in labels

    pr_present = signals.has_pr_link()
    # Prefer platform inferred from actual PR URLs; fall back to repo mapping.
    dev_links = list(signals.development_links)
    inferred = infer_platform_from_links(dev_links)
    if inferred != "none":
        platform: RepoPlatform = inferred  # type: ignore[assignment]
        platform_inferred = True
    else:
        platform = project_platform_for(signals.project_key, platform_mapping)
        platform_inferred = False

    decisions: list[RoutingDecision] = []

    # 1) Atlassian — always first.
    decisions.append(
        _decide(
            "atlassian",
            included=("atlassian" in available),
            reasons=_sorted_reasons(
                ["always_first"]
                + (
                    []
                    if "atlassian" in available
                    else ["skipped_provider_unavailable"]
                )
            ),
        )
    )

    # 2) GitHub / ADO — depends on PR + platform (inferred from URL or mapped).
    decisions.extend(_repo_decisions(platform, pr_present, available, platform_inferred=platform_inferred))

    # 3) SQL Server — depends on labels/components.
    db_label_hit = bool(labels & DB_SIGNAL_LABELS)
    db_component_hit = bool(components & DB_SIGNAL_COMPONENTS)
    db_reasons: list[RoutingReasonCode] = []
    db_included = False
    if db_label_hit:
        db_reasons.append("db_signal_label")
    if db_component_hit:
        db_reasons.append("db_signal_component")
    if db_label_hit or db_component_hit:
        if "sql_server" in available:
            db_included = True
        else:
            db_reasons.append("skipped_provider_unavailable")
    else:
        db_reasons.append("skipped_no_signal")
    decisions.append(
        _decide("sql_server", included=db_included, reasons=_sorted_reasons(db_reasons))
    )

    # 4) Zephyr read — always attempted when available (dedupe pass).
    zephyr_reasons: list[RoutingReasonCode] = ["always_first"]
    zephyr_included = "zephyr_read" in available
    if not zephyr_included:
        zephyr_reasons.append("skipped_provider_unavailable")
    decisions.append(
        _decide(
            "zephyr_read",
            included=zephyr_included,
            reasons=_sorted_reasons(zephyr_reasons),
        )
    )

    # Depth escalation: critical OR regression-candidate -> full files allowed.
    escalate = priority_bucket == "critical" or has_regression_label
    if escalate:
        for d in decisions:
            extra: list[RoutingReasonCode] = []
            if priority_bucket == "critical":
                extra.append("priority_escalation")
            if has_regression_label:
                extra.append("regression_candidate")
            d.reasons = _sorted_reasons(list(d.reasons) + extra)

    max_files = _max_files_for(priority_bucket, escalate)

    return RoutingPlan(
        decisions=_canonical_order(decisions),
        platform=platform,
        include_full_files=escalate,
        max_changed_files=max_files,
    )


def _repo_decisions(
    platform: RepoPlatform,
    pr_present: bool,
    available: set[ProviderName],
    *,
    platform_inferred: bool = False,
) -> list[RoutingDecision]:
    """Emit github + ado decisions exactly once each.

    platform_inferred=True means the platform was read from the PR URL itself
    (not from the project repo mapping table).
    """
    out: list[RoutingDecision] = []
    for repo_provider in ("github", "ado"):
        reasons: list[RoutingReasonCode] = []
        included = False
        if not pr_present:
            reasons.append("skipped_no_pr")
        elif platform == "none":
            reasons.append("skipped_no_mapping")
            reasons.append("platform_mapping_missing")
        elif platform != repo_provider:
            # PR exists but routes to the other repo platform.
            reasons.append("skipped_no_mapping")
        else:
            reasons.append("pr_link_present")
            if platform_inferred:
                reasons.append("platform_inferred_from_dev_link")
            else:
                reasons.append("platform_mapping_resolved")
            if repo_provider in available:
                included = True
            else:
                reasons.append("skipped_provider_unavailable")
        out.append(
            _decide(repo_provider, included=included, reasons=_sorted_reasons(reasons))
        )
    return out


def _decide(
    provider: ProviderName,
    *,
    included: bool,
    reasons: list[RoutingReasonCode],
) -> RoutingDecision:
    return RoutingDecision(provider=provider, included=included, reasons=reasons)


def _sorted_reasons(
    reasons: Iterable[RoutingReasonCode],
) -> list[RoutingReasonCode]:
    # Stable, alphabetical, de-duplicated.
    return sorted(set(reasons))


def _canonical_order(decisions: list[RoutingDecision]) -> list[RoutingDecision]:
    index = {p: i for i, p in enumerate(PROVIDER_ORDER)}
    return sorted(decisions, key=lambda d: index.get(d.provider, 99))


def _max_files_for(priority_bucket: str, escalate: bool) -> int:
    if escalate:
        return 8
    if priority_bucket == "high":
        return 5
    if priority_bucket == "medium":
        return 3
    return 2
