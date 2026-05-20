"""Azure DevOps service client.

Phase 2 scope: identity/org validation and repo listing.
PR fetch helpers are stubs that Phase 3 will fill in.
"""
import base64

import httpx
import structlog

try:
    from backend.config.settings import get_settings
except ImportError:  # pragma: no cover
    from config.settings import get_settings


logger = structlog.get_logger("testdeck.ado_service")

ADO_BASE = "https://dev.azure.com"
ADO_API_VERSION = "7.1-preview.1"


def _basic_auth(pat: str) -> str:
    raw = f":{pat}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


def _headers(token: str, *, auth_mode: str = "pat") -> dict[str, str]:
    """Pick PAT basic-auth (default) or OAuth Bearer auth.

    Existing call sites pass only a token; they keep PAT semantics.
    OAuth-aware call sites pass `auth_mode="oauth"`.
    """
    if auth_mode == "oauth":
        authz = f"Bearer {token}"
    else:
        authz = _basic_auth(token)
    return {
        "Authorization": authz,
        "Accept": "application/json",
    }


def _preferred_token() -> tuple[str, str]:
    """Phase 17 — OAuth Entra bearer first, ADO PAT fallback second.

    Returns (token, auth_mode) where auth_mode is "oauth" or "pat".
    """
    try:
        from backend.services.auth import identity_service
        from backend.config.settings import get_settings as _gs
    except ImportError:  # pragma: no cover
        from services.auth import identity_service
        from config.settings import get_settings as _gs
    oauth_token = identity_service.get_oauth_access_token("entra")
    if oauth_token:
        return oauth_token, "oauth"
    return _gs().ado_access_token, "pat"


async def test_connection(org: str | None = None, token: str | None = None) -> dict:
    """Validate the ADO PAT by listing projects for the org."""
    settings = get_settings()
    org_name = org or settings.ado_org
    if token:
        tok, mode = token, "pat"
    else:
        tok, mode = _preferred_token()
    if not org_name or not tok:
        return {"ok": False, "error": "Azure DevOps organization or token not configured"}
    url = f"{ADO_BASE}/{org_name}/_apis/projects"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                url,
                headers=_headers(tok, auth_mode=mode),
                params={"api-version": "7.1-preview.4"},
            )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "ok": True,
                "org": org_name,
                "project_count": data.get("count", len(data.get("value", []))),
            }
        return {"ok": False, "error": f"Azure DevOps returned {resp.status_code}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def list_repo_suggestions(limit: int = 50) -> list[str]:
    """Return up to `limit` repos formatted as `project/repo`."""
    settings = get_settings()
    tok, mode = _preferred_token()
    if not settings.ado_org or not tok:
        return []
    url = f"{ADO_BASE}/{settings.ado_org}/_apis/git/repositories"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                url,
                headers=_headers(tok, auth_mode=mode),
                params={"api-version": "7.1-preview.1"},
            )
        if resp.status_code != 200:
            return []
        items = resp.json().get("value", [])[:limit]
        return [
            f"{r.get('project', {}).get('name', '')}/{r.get('name', '')}"
            for r in items
            if r.get("name")
        ]
    except Exception as exc:
        logger.warning("ado_list_repos_failed", error=str(exc))
        return []


async def fetch_pull_request(
    _org: str, _project: str, _repo: str, _pr_id: int
) -> dict:
    """Stub for Phase 3."""
    raise NotImplementedError("ado_service.fetch_pull_request is a Phase 3 helper")


async def fetch_pull_request_changes(
    _org: str, _project: str, _repo: str, _pr_id: int
) -> list[dict]:
    """Stub for Phase 3."""
    raise NotImplementedError(
        "ado_service.fetch_pull_request_changes is a Phase 3 helper"
    )
