from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException

try:
    from backend.schemas.live_models import (
        ContextMetadataEnvelope,
        CreateLiveBoardRequest,
        LiveActivityCreate,
        LiveActivityEvent,
        LiveBoardResponse,
        LiveGenerateRequest,
        LiveGeneratedCases,
        LiveGeneratedCasesCreate,
        LiveGeneratedCasesPatch,
        LivePinnedTicket,
        LivePinnedTicketUpsert,
        LivePublishCasesRequest,
        LivePublishCasesResponse,
        RoutingDecisionEnvelope,
        UpdateLiveBoardRequest,
    )
    from backend.services import (
        ai_service,
        context_orchestrator,
        jira_service,
        live_artifact_service,
        live_board_service,
        live_publish_service,
        observability_service as obs,
    )
    from backend.services.context_orchestrator import AtlassianContextRequired
    from backend.utils.http_errors import upstream_error
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from schemas.live_models import (
        ContextMetadataEnvelope,
        CreateLiveBoardRequest,
        LiveActivityCreate,
        LiveActivityEvent,
        LiveBoardResponse,
        LiveGenerateRequest,
        LiveGeneratedCases,
        LiveGeneratedCasesCreate,
        LiveGeneratedCasesPatch,
        LivePinnedTicket,
        LivePinnedTicketUpsert,
        LivePublishCasesRequest,
        LivePublishCasesResponse,
        RoutingDecisionEnvelope,
        UpdateLiveBoardRequest,
    )
    from services import (
        ai_service,
        context_orchestrator,
        jira_service,
        live_artifact_service,
        live_board_service,
        live_publish_service,
        observability_service as obs,
    )
    from services.context_orchestrator import AtlassianContextRequired
    from utils.http_errors import upstream_error


_logger = structlog.get_logger("testdeck.live_routes")


async def _load_generation_ticket(input_ticket: dict) -> tuple[dict, dict | None]:
    """Re-fetch the ticket by key so dev-status enrichment runs before routing.

    Returns (ticket_for_generation, warning_metadata).
      - ticket_for_generation: enriched ticket when re-fetch succeeds, else input.
      - warning_metadata: None on success, otherwise a small dict the caller
        appends to context_metadata.errors so the UI can explain why PR
        context wasn't used.

    Never raises — a Jira failure must not abort generation.
    """
    key = str(input_ticket.get("key") or "").strip()
    if not key:
        return input_ticket, None
    try:
        tickets = await jira_service.get_tickets_by_keys([key])
    except Exception as exc:
        _logger.warning(
            "live_generate_ticket_enrichment_failed",
            ticket_key=key,
            error_class=type(exc).__name__,
        )
        return input_ticket, {
            "provider": "atlassian",
            "code": "ticket_enrichment_failed",
            "message": "Could not re-fetch ticket with development links",
        }
    if not tickets:
        return input_ticket, {
            "provider": "atlassian",
            "code": "ticket_enrichment_failed",
            "message": "Ticket not found on re-fetch",
        }
    enriched = tickets[0]
    # Carry forward any caller-supplied fields the enriched copy might miss
    # (e.g. acceptance_criteria typed in the UI before generation).
    merged = {**input_ticket, **enriched}
    return merged, None


def _development_link_warnings(ticket: dict) -> list[dict]:
    """Translate ticket-level development link state into context_metadata errors."""
    warnings: list[dict] = []
    links = ticket.get("development_links") or []
    pull_requests = ticket.get("pull_requests") or []
    dev_error = (ticket.get("development_links_error") or "").strip()

    if dev_error and not pull_requests:
        warnings.append(
            {
                "provider": "atlassian",
                "code": "development_links_unavailable",
                "message": dev_error,
            }
        )
    elif not links and not pull_requests:
        warnings.append(
            {
                "provider": "atlassian",
                "code": "no_development_links",
                "message": "No PR links found on the ticket",
            }
        )
    elif links and not pull_requests:
        warnings.append(
            {
                "provider": "atlassian",
                "code": "development_links_unparseable",
                "message": "Development links present but no PR could be parsed",
            }
        )
    return warnings


router = APIRouter(prefix="/live", tags=["live"])


# =============================================================================
# Boards
# =============================================================================


@router.get("/boards", response_model=list[LiveBoardResponse])
async def list_boards():
    return await live_board_service.list_boards()


@router.post("/boards", response_model=LiveBoardResponse)
async def create_board(req: CreateLiveBoardRequest):
    try:
        return await live_board_service.create_board(
            name=req.name,
            jql=req.jql,
            columns=req.columns,
            profile=req.profile,
            view_prefs=req.view_prefs,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/boards/{board_id}", response_model=LiveBoardResponse)
async def get_board(board_id: str):
    board = await live_board_service.get_board(board_id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@router.patch("/boards/{board_id}", response_model=LiveBoardResponse)
async def update_board(board_id: str, req: UpdateLiveBoardRequest):
    try:
        updated = await live_board_service.update_board(
            board_id,
            name=req.name,
            jql=req.jql,
            columns=req.columns,
            pinned=req.pinned,
            profile=req.profile,
            view_prefs=req.view_prefs,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Board not found")
    return updated


@router.delete("/boards/{board_id}")
async def delete_board(board_id: str):
    deleted = await live_board_service.delete_board(board_id)
    return {"deleted": deleted}


# =============================================================================
# Generation
# =============================================================================


@router.post("/generate")
async def live_generate(req: LiveGenerateRequest):
    """Generate test cases for a single ticket. Skips grouping.

    Routes through the context orchestrator by default and returns a
    `context_metadata` envelope so the UI can show the "Using tools"
    indicator and PR discovery state. The legacy direct-ticket path stays
    available behind `use_context_bundle=False`.

    Board-card tickets arrive without dev-status enrichment, so this
    endpoint re-fetches the ticket by key before routing to guarantee
    consistent PR discovery whether the caller is a board or drawer.
    """
    try:
        ticket_key = str(req.ticket.get("key") or "")
        if not req.use_context_bundle:
            with obs.request_scope("live"):
                timer = obs.Timer()
                result = await ai_service.generate_test_cases(
                    [req.ticket], req.instructions
                )
                obs.generation_completed(
                    ticket_key=ticket_key,
                    test_case_count=len(result.get("test_cases", []) or []),
                    duration_ms=timer.ms(),
                    routed=False,
                )
                return result

        with obs.request_scope("live"):
            timer = obs.Timer()
            ticket_for_gen, enrichment_warning = await _load_generation_ticket(
                req.ticket
            )
            try:
                bundle = await context_orchestrator.build_for_ticket(ticket_for_gen)
            except AtlassianContextRequired as exc:
                # Atlassian is the source of truth — abort generation rather
                # than serve a low-quality result without the ticket.
                raise upstream_error("Atlassian", exc)

            cases = await ai_service.generate_test_cases_from_bundle(
                bundle, req.instructions
            )
            obs.generation_completed(
                ticket_key=ticket_key,
                test_case_count=len(cases.get("test_cases", []) or []),
                duration_ms=timer.ms(),
                routed=True,
            )

            extra_errors: list[dict] = []
            if enrichment_warning:
                extra_errors.append(enrichment_warning)
            extra_errors.extend(_development_link_warnings(ticket_for_gen))

            diag = ticket_for_gen.get("development_links_diagnostics")
            meta = ContextMetadataEnvelope(
                providers_called=list(bundle.tool_trace.providers_called),
                routing_decisions=[
                    RoutingDecisionEnvelope(
                        provider=d.provider,
                        included=d.included,
                        reasons=list(d.reasons),
                    )
                    for d in bundle.tool_trace.routing_decisions
                ],
                latency_ms=dict(bundle.tool_trace.latency_ms),
                errors=[e.model_dump() for e in bundle.tool_trace.errors] + extra_errors,
                input_chars=bundle.budget.input_chars,
                per_section_chars=dict(bundle.budget.per_section_chars),
                hard_cap_chars=bundle.budget.hard_cap_chars,
                truncated_sections=list(bundle.budget.truncated_sections),
                development_links_diagnostics=diag if isinstance(diag, dict) else None,
            )

            return {
                "test_cases": cases.get("test_cases", []),
                "context_metadata": meta.model_dump(),
            }
    except HTTPException:
        raise
    except Exception as e:
        raise upstream_error("Gemini", e)


# =============================================================================
# Phase 01 — Live workflow artifacts: pinned tickets, generated cases, activity
# =============================================================================


@router.get("/pins", response_model=list[LivePinnedTicket])
async def list_pins():
    return await live_artifact_service.list_pinned_tickets()


@router.put("/pins/{ticket_key}", response_model=LivePinnedTicket)
async def upsert_pin(ticket_key: str, req: LivePinnedTicketUpsert):
    try:
        return await live_artifact_service.upsert_pinned_ticket(ticket_key, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/pins/{ticket_key}")
async def delete_pin(ticket_key: str):
    deleted = await live_artifact_service.delete_pinned_ticket(ticket_key)
    return {"deleted": deleted}


@router.get("/generated-cases", response_model=list[LiveGeneratedCases])
async def list_generated_cases(ticket_key: Optional[str] = None):
    return await live_artifact_service.list_generated_cases(
        ticket_key=ticket_key
    )


@router.post("/generated-cases", response_model=LiveGeneratedCases, status_code=201)
async def create_generated_cases(req: LiveGeneratedCasesCreate):
    return await live_artifact_service.create_generated_cases(req)


@router.patch(
    "/generated-cases/{case_set_id}",
    response_model=LiveGeneratedCases,
)
async def patch_generated_cases(case_set_id: str, req: LiveGeneratedCasesPatch):
    try:
        updated = await live_artifact_service.patch_generated_cases(case_set_id, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if updated is None:
        raise HTTPException(status_code=404, detail="Generated cases not found")
    return updated


@router.delete("/generated-cases/{case_set_id}")
async def delete_generated_cases(case_set_id: str):
    deleted = await live_artifact_service.delete_generated_cases(case_set_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Generated cases not found")
    return {"deleted": True}


_PUBLISH_ERROR_STATUS: dict[str, int] = {
    "case_set_not_found": 404,
    "missing_ticket_key": 400,
    "missing_project_key": 400,
    "no_cases_in_set": 400,
    "no_cases_selected": 400,
    "invalid_case_index": 400,
    "duplicate_publish_unconfirmed": 409,
}


@router.post(
    "/generated-cases/{case_set_id}/publish",
    response_model=LivePublishCasesResponse,
)
async def publish_generated_cases(
    case_set_id: str, req: LivePublishCasesRequest
):
    """Phase 06b — publish a generated case set back to the Jira ticket.

    Primary path: create Zephyr Scale test cases linked to the source Jira
    issue so they appear in the ticket's Test Cases panel. Fallback path:
    post a structured Jira comment with the cases. The response truthfully
    reports whether the result appears on the Jira ticket via
    `appears_on_jira_ticket`.
    """
    try:
        return await live_publish_service.publish_generated_cases(
            case_set_id, req
        )
    except live_publish_service.PublishError as e:
        status = _PUBLISH_ERROR_STATUS.get(e.code, 400)
        raise HTTPException(status_code=status, detail=str(e))


@router.get("/activity", response_model=list[LiveActivityEvent])
async def list_activity(
    board_id: Optional[str] = None, limit: int = 100
):
    return await live_artifact_service.list_activity(
        board_id=board_id, limit=limit
    )


@router.post("/activity", response_model=LiveActivityEvent, status_code=201)
async def create_activity(req: LiveActivityCreate):
    return await live_artifact_service.create_activity(req)


@router.delete("/activity")
async def clear_activity(board_id: Optional[str] = None):
    count = await live_artifact_service.clear_activity(board_id=board_id)
    return {"deleted": count}
