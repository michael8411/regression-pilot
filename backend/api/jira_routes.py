import structlog
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

try:
    from backend.schemas.request_models import TicketKeysRequest
    from backend.schemas.live_models import (
        BoardResponse,
        JiraCommentRequest,
        JiraCommentSubmitResponse,
        JiraTransitionRequest,
        JiraTransitionResponse,
        JiraTransitionResult,
        SecretScanWarning,
    )
    from backend.services import jira_service
    from backend.utils.http_errors import upstream_error
    from backend.utils.secret_scanner import scan_for_secrets
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from schemas.request_models import TicketKeysRequest
    from schemas.live_models import (
        BoardResponse,
        JiraCommentRequest,
        JiraCommentSubmitResponse,
        JiraTransitionRequest,
        JiraTransitionResponse,
        JiraTransitionResult,
        SecretScanWarning,
    )
    from services import jira_service
    from utils.http_errors import upstream_error
    from utils.secret_scanner import scan_for_secrets


router = APIRouter(prefix="/jira", tags=["jira"])
logger = structlog.get_logger("testdeck.jira")


def _findings_to_names(findings) -> list[str]:
    if not findings:
        return []
    out: list[str] = []
    for f in findings:
        if isinstance(f, dict):
            name = f.get("pattern_name")
            if name:
                out.append(name)
    return out


@router.get("/projects")
async def list_projects():
    try:
        return await jira_service.get_projects()
    except Exception as e:
        raise upstream_error("Jira API", e)


@router.get("/projects/{project_key}/versions")
async def list_versions(
    project_key: str,
    status: str = "unreleased",
    order_by: str = "-releaseDate",
):
    try:
        return await jira_service.get_versions(project_key, status=status, order_by=order_by)
    except Exception as e:
        raise upstream_error("Jira API", e)


@router.get("/projects/{project_key}/components")
async def list_components(project_key: str):
    try:
        return await jira_service.get_components(project_key)
    except Exception as e:
        raise upstream_error("Jira API", e)


@router.get("/projects/{project_key}/statuses")
async def list_project_statuses(project_key: str):
    from datetime import datetime, timezone

    try:
        statuses = await jira_service.get_project_statuses(project_key)
    except jira_service.JiraNotFoundError:
        return JSONResponse(
            status_code=404, content={"error": "project_not_found"}
        )
    except jira_service.JiraUnavailableError:
        return JSONResponse(
            status_code=502, content={"error": "jira_unavailable"}
        )
    return {
        "project_key": project_key,
        "statuses": statuses,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/tickets")
async def get_tickets(fix_version: str):
    try:
        return await jira_service.get_tickets_by_version(fix_version)
    except Exception as e:
        raise upstream_error("Jira API", e)


@router.post("/tickets/by-keys")
async def get_tickets_by_keys(req: TicketKeysRequest):
    try:
        return await jira_service.get_tickets_by_keys(req.keys)
    except Exception as e:
        raise upstream_error("Jira API", e)


@router.get("/board", response_model=BoardResponse)
async def get_board(jql: str):
    if not jql.strip():
        raise HTTPException(status_code=400, detail="jql query parameter is required")
    try:
        return await jira_service.get_board(jql)
    except Exception as e:
        raise upstream_error("Jira API", e)


@router.post("/tickets/{key}/comments", response_model=JiraCommentSubmitResponse)
async def post_comment(key: str, req: JiraCommentRequest):
    findings = scan_for_secrets(req.body)
    pattern_names = _findings_to_names(findings)
    if pattern_names:
        logger.warning(
            "jira_comment_secret_scan_hit",
            ticket_key=key,
            patterns=pattern_names,
        )
    try:
        comment = await jira_service.post_comment(key, req.body)
    except Exception as e:
        raise upstream_error("Jira API", e)
    return JiraCommentSubmitResponse(
        comment=comment,
        secret_scan_warnings=[SecretScanWarning(pattern_name=p) for p in pattern_names],
    )


@router.get("/tickets/{key}/transitions", response_model=list[JiraTransitionResponse])
async def get_transitions(key: str):
    try:
        return await jira_service.get_transitions(key)
    except Exception as e:
        raise upstream_error("Jira API", e)


@router.post("/tickets/{key}/transitions", response_model=JiraTransitionResult)
async def do_transition(key: str, req: JiraTransitionRequest):
    try:
        # Idempotency: short-circuit if already in the target status.
        transitions = await jira_service.get_transitions(key)
        match = next((t for t in transitions if t["id"] == req.transitionId), None)
        if not match:
            raise HTTPException(
                status_code=400, detail="Unknown transition for this ticket"
            )
        current = await jira_service.get_status(key)
        target_name = (match.get("to") or {}).get("name")
        if current and target_name and current == target_name:
            return JiraTransitionResult(ok=True, skipped=True)
        await jira_service.do_transition(key, req.transitionId)
        return JiraTransitionResult(ok=True, skipped=False)
    except HTTPException:
        raise
    except Exception as e:
        raise upstream_error("Jira API", e)
