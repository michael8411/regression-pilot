from typing import Optional

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
        live_artifact_service,
        live_board_service,
        live_publish_service,
        observability_service as obs,
    )
    from services.context_orchestrator import AtlassianContextRequired
    from utils.http_errors import upstream_error


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

    Phase 3: routes through the context orchestrator by default and
    returns a `context_metadata` envelope so the UI can render the
    "Using tools" indicator and surface budget/diagnostics. The legacy
    direct-ticket path is preserved behind `use_context_bundle=False`.
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
            try:
                bundle = await context_orchestrator.build_for_ticket(req.ticket)
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
                errors=[e.model_dump() for e in bundle.tool_trace.errors],
                input_chars=bundle.budget.input_chars,
                per_section_chars=dict(bundle.budget.per_section_chars),
                hard_cap_chars=bundle.budget.hard_cap_chars,
                truncated_sections=list(bundle.budget.truncated_sections),
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
