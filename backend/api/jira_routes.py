from fastapi import APIRouter

try:
    from backend.schemas.request_models import TicketKeysRequest
    from backend.services import jira_service
    from backend.utils.http_errors import upstream_error
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from schemas.request_models import TicketKeysRequest
    from services import jira_service
    from utils.http_errors import upstream_error

router = APIRouter(prefix="/jira", tags=["jira"])


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
