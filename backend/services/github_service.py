"""GitHub service client.

Phase 2 scope: identity test and repo listing for mapping suggestions.
PR fetch helpers are stubs that Phase 3 will fill in.
"""
import base64

import httpx
import structlog

try:
    from backend.config.settings import get_settings
except ImportError:  # pragma: no cover
    from config.settings import get_settings


logger = structlog.get_logger("testdeck.github_service")

GITHUB_API = "https://api.github.com"


def _auth_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _preferred_token(explicit: str | None = None) -> str:
    """Phase 17 — OAuth access token first, PAT fallback second."""
    if explicit:
        return explicit
    try:
        from backend.services.auth import identity_service
        from backend.config.settings import get_settings as _gs
    except ImportError:  # pragma: no cover
        from services.auth import identity_service
        from config.settings import get_settings as _gs
    oauth_token = identity_service.get_oauth_access_token("github")
    if oauth_token:
        return oauth_token
    return _gs().github_access_token


async def test_connection(token: str | None = None) -> dict:
    """Validate the GitHub token by hitting `/user`."""
    tok = _preferred_token(token)
    if not tok:
        return {"ok": False, "error": "GitHub access token not configured"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{GITHUB_API}/user", headers=_auth_headers(tok))
        if resp.status_code == 200:
            data = resp.json()
            return {
                "ok": True,
                "login": data.get("login"),
                "name": data.get("name"),
            }
        return {"ok": False, "error": f"GitHub returned {resp.status_code}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def list_repo_suggestions(limit: int = 30) -> list[str]:
    """Return up to `limit` repo full names (owner/repo) accessible to the token."""
    tok = _preferred_token()
    if not tok:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{GITHUB_API}/user/repos",
                headers=_auth_headers(tok),
                params={"per_page": min(limit, 100), "sort": "updated"},
            )
        if resp.status_code != 200:
            return []
        return [r.get("full_name", "") for r in resp.json() if r.get("full_name")]
    except Exception as exc:
        logger.warning("github_list_repos_failed", error=str(exc))
        return []


async def fetch_pull_request(_owner: str, _repo: str, _number: int) -> dict:
    """Stub for Phase 3 — return raw PR shape."""
    raise NotImplementedError("github_service.fetch_pull_request is a Phase 3 helper")


async def fetch_pull_request_files(
    _owner: str, _repo: str, _number: int
) -> list[dict]:
    """Stub for Phase 3 — return changed files list with diffs."""
    raise NotImplementedError(
        "github_service.fetch_pull_request_files is a Phase 3 helper"
    )


def _decode_b64(s: str) -> str:
    try:
        return base64.b64decode(s).decode("utf-8", errors="replace")
    except Exception:
        return ""
