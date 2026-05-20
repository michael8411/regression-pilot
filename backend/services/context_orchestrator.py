"""Context orchestrator — single entry point for generation context assembly.

Responsibilities:
- Pull the project -> repo platform mapping from the database.
- Build an AdapterSet from configured services (GitHub/ADO/Zephyr/etc.).
- Delegate routing + fan-out to context_bundle_service.
- Enforce the Phase 3 failure policy:
    * Atlassian failure aborts generation (ticket is the source of truth).
    * Repo failure continues with metadata warning.
    * SQL failure continues with metadata warning.
    * Zephyr read failure continues without dedupe + warning.
- Return the budgeted bundle.

The orchestrator does *not* touch the prompt builder — that responsibility
stays in ai_service. The caller is expected to read context_metadata from
bundle.tool_trace + bundle.budget for telemetry/UI.
"""

from __future__ import annotations

import structlog

try:
    from backend.config.settings import get_settings
    from backend.schemas.context_bundle_models import ContextBundle, RepoPlatform
    from backend.services.context_bundle_service import (
        AdapterSet,
        build_context_bundle,
    )
    from backend.services import observability_service as obs
    from backend.services.prompt_budget_service import BudgetPolicy, DEFAULT_POLICY
    from backend.services.project_repo_map_service import list_mappings
    from backend.services.provider_adapters import (
        AtlassianTicketAdapter,
        AdoRestAdapter,
        GithubRestAdapter,
        SqlServerStubAdapter,
        ZephyrRestReadAdapter,
    )
except ImportError:  # pragma: no cover
    from config.settings import get_settings
    from schemas.context_bundle_models import ContextBundle, RepoPlatform
    from services.context_bundle_service import AdapterSet, build_context_bundle
    from services import observability_service as obs
    from services.prompt_budget_service import BudgetPolicy, DEFAULT_POLICY
    from services.project_repo_map_service import list_mappings
    from services.provider_adapters import (
        AtlassianTicketAdapter,
        AdoRestAdapter,
        GithubRestAdapter,
        SqlServerStubAdapter,
        ZephyrRestReadAdapter,
    )


logger = structlog.get_logger("testdeck.context_orchestrator")


class AtlassianContextRequired(Exception):
    """Raised when Atlassian (the only required provider) cannot be fulfilled."""


async def load_platform_mapping() -> dict[str, RepoPlatform]:
    """Load project -> platform map from the project_repo_map table."""
    try:
        rows = await list_mappings()
    except Exception as exc:  # pragma: no cover - DB error path
        logger.warning("repo_map_load_failed", error=str(exc))
        return {}
    out: dict[str, RepoPlatform] = {}
    for r in rows:
        platform = "github" if r.platform == "github" else "ado"
        out[r.jira_project.upper()] = platform  # type: ignore[assignment]
    return out


def build_default_adapters(ticket: dict) -> AdapterSet:
    """Construct an AdapterSet from the current settings.

    Only adapters whose underlying service is configured are wired in.
    The orchestrator passes the raw ticket dict to the Atlassian adapter
    so it doesn't need a second Jira round-trip.
    """
    s = get_settings()
    return AdapterSet(
        atlassian=AtlassianTicketAdapter(ticket=ticket),
        github=GithubRestAdapter() if s.github_configured else None,
        ado=AdoRestAdapter() if s.ado_configured else None,
        sql_server=SqlServerStubAdapter(),  # always present, always raises
        zephyr_read=ZephyrRestReadAdapter() if s.zephyr_api_token else None,
    )


async def build_for_ticket(
    ticket: dict,
    *,
    adapters: AdapterSet | None = None,
    platform_mapping: dict[str, RepoPlatform] | None = None,
    policy: BudgetPolicy = DEFAULT_POLICY,
    abort_on_atlassian_failure: bool = True,
) -> ContextBundle:
    """Top-level orchestrator entry point.

    Wires real adapters by default. Callers can inject a custom AdapterSet
    (notably tests) to override individual providers.
    """
    if adapters is None:
        adapters = build_default_adapters(ticket)
    if platform_mapping is None:
        platform_mapping = await load_platform_mapping()

    bundle = await build_context_bundle(
        ticket,
        adapters=adapters,
        platform_mapping=platform_mapping,
        policy=policy,
    )

    # Emit observability events for downstream telemetry. Routing decisions
    # are summarized to (provider -> reasons) so log volume stays bounded.
    ticket_key = str(ticket.get("key", ""))
    project_key = ticket_key.split("-", 1)[0] if "-" in ticket_key else ""
    reasons_map = {
        d.provider: list(d.reasons) for d in bundle.tool_trace.routing_decisions
    }
    included = [
        d.provider for d in bundle.tool_trace.routing_decisions if d.included
    ]
    platform_used = "github" if "github" in included else (
        "ado" if "ado" in included else "none"
    )
    obs.context_route_selected(
        ticket_key=ticket_key,
        project_key=project_key,
        providers_included=included,
        reasons=reasons_map,
        platform=platform_used,
        include_full_files=False,  # full-file fetch is handled inside adapters
    )
    for provider, ms in bundle.tool_trace.latency_ms.items():
        provider_errs = [
            e for e in bundle.tool_trace.errors if e.provider == provider
        ]
        obs.provider_call_completed(
            provider=provider,
            ticket_key=ticket_key,
            duration_ms=int(ms),
            ok=len(provider_errs) == 0,
            error_code=provider_errs[0].code if provider_errs else None,
        )
    obs.bundle_budget_applied(
        ticket_key=ticket_key,
        input_chars=bundle.budget.input_chars,
        hard_cap_chars=bundle.budget.hard_cap_chars,
        per_section_chars=dict(bundle.budget.per_section_chars),
        truncated_sections=list(bundle.budget.truncated_sections),
    )

    if abort_on_atlassian_failure:
        for err in bundle.tool_trace.errors:
            if err.provider == "atlassian":
                raise AtlassianContextRequired(
                    f"Atlassian provider failed: {err.code} {err.message}"
                )

    logger.info(
        "context_built",
        ticket_key=str(ticket.get("key", "")),
        providers_called=list(bundle.tool_trace.providers_called),
        input_chars=bundle.budget.input_chars,
        truncated_sections=list(bundle.budget.truncated_sections),
    )
    return bundle
