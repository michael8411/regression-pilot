import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

try:
    from backend.config.settings import get_settings
    from backend.services.dev_link_parser import parse_pr_url
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.settings import get_settings
    from services.dev_link_parser import parse_pr_url

logger = logging.getLogger(__name__)

REQUEST_DELAY_SECONDS = 1.5

# Probe list for Jira dev-status API: (provider_hint, applicationType).
# Each probe covers one SCM integration type that Jira may return.
DEV_STATUS_PROBES: list[tuple[str, str]] = [
    ("github", "GitHub"),
    ("ado", "azure-devops"),
    ("ado", "com.microsoft.azure-devops"),
]


def _resolve_dev_status_probes() -> list[tuple[str, str]]:
    """Merge user-configured applicationTypes with built-in defaults.

    Built-ins always come first so their provider_hint sticks; configured
    extras default to unknown hint and let URL parsing decide provider.
    Imports `get_settings` lazily so test fixtures that reload
    `config.settings` see the fresh, keyring-aware Settings instance.
    """
    try:
        try:
            from backend.config.settings import get_settings as _gs
        except ImportError:  # pragma: no cover
            from config.settings import get_settings as _gs
        configured = (_gs().jira_dev_status_application_types or "").strip()
    except Exception:
        configured = ""
    if not configured:
        return list(DEV_STATUS_PROBES)

    existing = {app_type.lower() for _, app_type in DEV_STATUS_PROBES}
    merged = list(DEV_STATUS_PROBES)
    for raw in configured.split(","):
        app_type = raw.strip()
        if not app_type or app_type.lower() in existing:
            continue
        existing.add(app_type.lower())
        # Heuristic provider hint — the dev_link_parser still has final say.
        hint = "github" if "github" in app_type.lower() else (
            "ado" if "azure" in app_type.lower() or "devops" in app_type.lower() else "unknown"
        )
        merged.append((hint, app_type))
    return merged

_STATE_MAP: dict[str, str] = {
    "open": "open",
    "merged": "merged",
    "closed": "closed",
    "declined": "closed",
    "abandoned": "closed",
    "completed": "merged",
    "active": "open",
}


def _normalize_pr_state(raw: str) -> str:
    return _STATE_MAP.get((raw or "").lower(), "unknown")


def _parse_iso_ts(s: str) -> float:
    """Return a float timestamp for sorting; 0.0 on parse failure."""
    if not s:
        return 0.0
    try:
        from datetime import datetime as _dt
        return _dt.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


# Cheap pre-check to decide whether a string is worth running through
# parse_pr_url. Faster than calling the parser on every string field we see.
_PR_URL_HINT_RE = re.compile(r"pull/\d+|pullrequest/\d+", re.IGNORECASE)


def _looks_like_pr_url(s: str) -> bool:
    return bool(s) and bool(_PR_URL_HINT_RE.search(s))


def _extract_pr_candidates(node: Any, *, found: list[dict] | None = None) -> list[dict]:
    """Recursively walk a dev-status payload collecting PR-like dict objects.

    A node qualifies as a PR candidate when it is a dict and either has an
    obvious url/displayUrl/link field, OR its `details.url` resolves to a
    recognizable PR URL, OR any of its string fields looks like a PR URL.

    Returns the raw PR-like dicts; normalization happens after dedupe.
    """
    if found is None:
        found = []
    if isinstance(node, dict):
        candidate_url = ""
        for key in ("url", "displayUrl", "link", "self"):
            v = node.get(key)
            if isinstance(v, str) and _looks_like_pr_url(v):
                candidate_url = v
                break
        if not candidate_url:
            nested = node.get("details")
            if isinstance(nested, dict):
                v = nested.get("url")
                if isinstance(v, str) and _looks_like_pr_url(v):
                    candidate_url = v
        if not candidate_url:
            for v in node.values():
                if isinstance(v, str) and _looks_like_pr_url(v):
                    candidate_url = v
                    break

        if candidate_url:
            found.append({**node, "_resolved_url": candidate_url})
        else:
            # Recurse into children regardless — payloads sometimes nest PR
            # arrays under `details.pullRequests` or arbitrary group keys.
            for v in node.values():
                _extract_pr_candidates(v, found=found)
    elif isinstance(node, list):
        for item in node:
            _extract_pr_candidates(item, found=found)
    return found


def _normalize_dev_status_prs(detail_list: list[dict], provider_hint: str) -> list[dict]:
    """Extract and normalize PR objects from a single dev-status probe response.

    Walks the explicit details.pullRequests path first, then sweeps the rest
    of the payload to catch non-standard nesting. PRs are deduped by URL key
    inside this function so duplicate captures from both paths collapse.
    """
    prs: list[dict] = []
    seen_url_keys: set[str] = set()

    candidates: list[dict] = []
    for detail in detail_list or []:
        if not isinstance(detail, dict):
            continue
        nested = detail.get("details") or {}
        if isinstance(nested, dict):
            for pr_raw in nested.get("pullRequests") or []:
                if isinstance(pr_raw, dict):
                    candidates.append(pr_raw)
    # Recursive sweep catches anything the explicit path missed (different
    # integration shapes nest PR-like dicts under arbitrary keys).
    _extract_pr_candidates(detail_list, found=candidates)

    for pr_raw in candidates:
        url = (
            pr_raw.get("_resolved_url")
            or pr_raw.get("url")
            or pr_raw.get("displayUrl")
            or pr_raw.get("link")
            or ""
        )
        if not url:
            for v in pr_raw.values():
                if isinstance(v, str) and _looks_like_pr_url(v):
                    url = v
                    break
        if not url:
            continue

        url_key = str(url).lower().rstrip("/")
        if url_key in seen_url_keys:
            continue
        seen_url_keys.add(url_key)

        parsed = parse_pr_url(str(url))
        provider = parsed["provider"] if parsed["provider"] != "unknown" else provider_hint

        title = (
            pr_raw.get("title")
            or pr_raw.get("name")
            or pr_raw.get("displayName")
            or ""
        )
        state_raw = (
            pr_raw.get("status")
            or pr_raw.get("state")
            or pr_raw.get("mergeStatus")
            or ""
        )
        repo = (
            pr_raw.get("repositoryName")
            or pr_raw.get("repository")
            or pr_raw.get("repo")
            or parsed.get("repository")
            or ""
        )
        updated_at = (
            pr_raw.get("lastUpdate")
            or pr_raw.get("lastUpdated")
            or pr_raw.get("updated")
            or ""
        )
        number = parsed.get("number")
        if number:
            pr_id = f"{provider}:{repo}:{number}"
        else:
            pr_id = f"{provider}:{url}"
        prs.append(
            {
                "id": pr_id,
                "provider": provider,
                "url": str(url),
                "title": str(title),
                "state": _normalize_pr_state(str(state_raw)),
                "repository": str(repo),
                "number": number,
                "updated_at": str(updated_at) if updated_at else None,
                "source": "jira_dev_status",
            }
        )
    return prs


_STATE_SORT_ORDER: dict[str, int] = {"open": 0, "merged": 1, "closed": 2, "unknown": 3}


@dataclass
class DevelopmentLinksResult:
    """Outcome of a Jira dev-status fetch, including diagnostics.

    Diagnostics intentionally exclude response bodies and credentials. The
    information here is safe to surface to UI and logs.
    """

    links: list[str] = field(default_factory=list)
    pull_requests: list[dict] = field(default_factory=list)
    error: str = ""
    diagnostics: dict = field(default_factory=dict)


def _classify_dev_status_error(status_code: int) -> str:
    if status_code in (401, 403):
        return "dev-status unauthorized"
    if status_code == 404:
        return "dev-status unavailable"
    if status_code == 429:
        return "dev-status rate limited"
    if status_code >= 500:
        return "dev-status unavailable"
    if status_code >= 400:
        return "dev-status unavailable"
    return ""


async def _probe_dev_status(
    client: httpx.AsyncClient,
    *,
    issue_id: str,
    provider_hint: str,
    app_type: str,
    label: str,
) -> tuple[list[dict], dict]:
    """Run one applicationType probe. Returns (prs, probe_diagnostics)."""
    diag: dict = {
        "provider_hint": provider_hint,
        "application_type": app_type,
        "status": 0,
        "ok": False,
        "pull_request_count": 0,
        "duration_ms": 0,
        "error": "",
    }
    t0 = time.monotonic()
    try:
        resp = await client.get(
            f"{_base_url()}/rest/dev-status/latest/issue/detail",
            params={
                "issueId": issue_id,
                "applicationType": app_type,
                "dataType": "pullrequest",
            },
        )
        diag["status"] = resp.status_code

        if resp.status_code == 429:
            retry_after = min(int(resp.headers.get("Retry-After", 10)), 30)
            await asyncio.sleep(retry_after)
            resp = await client.get(
                f"{_base_url()}/rest/dev-status/latest/issue/detail",
                params={
                    "issueId": issue_id,
                    "applicationType": app_type,
                    "dataType": "pullrequest",
                },
            )
            diag["status"] = resp.status_code

        if resp.status_code >= 400:
            diag["error"] = _classify_dev_status_error(resp.status_code)
            diag["duration_ms"] = int((time.monotonic() - t0) * 1000)
            logger.debug(
                "dev_status_fetch_failed label=%s status=%d elapsed_ms=%d",
                label, resp.status_code, diag["duration_ms"],
            )
            return [], diag

        try:
            data = resp.json()
            detail_list = data.get("detail") or []
            prs = _normalize_dev_status_prs(detail_list, provider_hint)
        except Exception:
            diag["error"] = "dev-status parse warning"
            diag["duration_ms"] = int((time.monotonic() - t0) * 1000)
            logger.debug("dev_status_fetch_failed label=%s error=parse_error", label)
            return [], diag

        diag["ok"] = True
        diag["pull_request_count"] = len(prs)
        diag["duration_ms"] = int((time.monotonic() - t0) * 1000)
        logger.debug(
            "dev_status_fetch_completed label=%s pr_count=%d elapsed_ms=%d",
            label, len(prs), diag["duration_ms"],
        )
        return prs, diag
    except Exception as exc:
        diag["error"] = "dev-status unavailable"
        diag["duration_ms"] = int((time.monotonic() - t0) * 1000)
        logger.debug(
            "dev_status_fetch_failed label=%s error=%s",
            label, type(exc).__name__,
        )
        return [], diag


def _dedupe_prs(all_prs: list[dict]) -> list[dict]:
    """Stable dedupe.

    Primary key: normalized url (lowercase, trailing slash stripped).
    When url is empty but we have provider/repo/number, fall back to
    `provider:repository:number` so two probes returning the same PR with
    slightly different url shapes still collapse.
    """
    seen: set[str] = set()
    out: list[dict] = []
    for pr in all_prs:
        url_key = (pr.get("url") or "").lower().rstrip("/")
        if not url_key:
            number = pr.get("number")
            if number is not None:
                url_key = f"{pr.get('provider', '')}:{pr.get('repository', '')}:{number}"
        if not url_key or url_key in seen:
            if url_key:
                continue
            # No dedupe key at all — keep but don't pollute the seen set.
            out.append(pr)
            continue
        seen.add(url_key)
        out.append(pr)
    return out


async def get_development_links_with_diagnostics(
    issue_id: str,
    issue_key: str = "",
) -> DevelopmentLinksResult:
    """Fetch Jira Development panel PRs and return safe diagnostics.

    Never raises. Diagnostics include per-probe status/duration/PR count and
    a safe error category. Bodies, tokens, and headers are never recorded.
    """
    probes_config = _resolve_dev_status_probes()
    diagnostics: dict[str, Any] = {
        "source": "jira_dev_status",
        "issue_id": str(issue_id or ""),
        "issue_key": str(issue_key or ""),
        "probes": [],
        "selected_pull_request_count": 0,
        "selected_link_count": 0,
        "error": "",
    }

    if not issue_id:
        diagnostics["error"] = "missing issue id"
        return DevelopmentLinksResult(error="missing issue id", diagnostics=diagnostics)

    all_prs: list[dict] = []
    last_error = ""

    async with await _client() as client:
        for provider_hint, app_type in probes_config:
            label = f"{issue_key or issue_id}/{app_type}"
            logger.debug("dev_status_fetch_started label=%s", label)
            prs, probe_diag = await _probe_dev_status(
                client,
                issue_id=issue_id,
                provider_hint=provider_hint,
                app_type=app_type,
                label=label,
            )
            diagnostics["probes"].append(probe_diag)
            if probe_diag["error"] and not prs:
                last_error = probe_diag["error"]
            all_prs.extend(prs)

    unique_prs = _dedupe_prs(all_prs)
    unique_prs.sort(
        key=lambda pr: (
            _STATE_SORT_ORDER.get(pr.get("state", "unknown"), 3),
            -_parse_iso_ts(pr.get("updated_at") or ""),
            pr.get("provider", ""),
            pr.get("repository", ""),
            pr.get("number") or 0,
            pr.get("url", ""),
        )
    )

    dev_links = [pr["url"] for pr in unique_prs if pr.get("url")]
    error = "" if unique_prs else last_error
    diagnostics["selected_pull_request_count"] = len(unique_prs)
    diagnostics["selected_link_count"] = len(dev_links)
    diagnostics["error"] = error
    return DevelopmentLinksResult(
        links=dev_links,
        pull_requests=unique_prs,
        error=error,
        diagnostics=diagnostics,
    )


async def get_development_links(
    issue_id: str,
    issue_key: str = "",
) -> tuple[list[str], list[dict], str]:
    """Compatibility wrapper around get_development_links_with_diagnostics.

    Returns (development_links, pull_requests, error). Existing callers that
    don't need diagnostics keep working unchanged.
    """
    result = await get_development_links_with_diagnostics(issue_id, issue_key)
    return result.links, result.pull_requests, result.error


async def _enrich_ticket_with_development_links(ticket: dict) -> dict:
    """Attach development_links, pull_requests, development_links_error, and
    development_links_diagnostics to a ticket dict.
    """
    issue_id = ticket.get("id", "")
    if not issue_id:
        empty_diag = {
            "source": "jira_dev_status",
            "issue_id": "",
            "issue_key": str(ticket.get("key", "")),
            "probes": [],
            "selected_pull_request_count": 0,
            "selected_link_count": 0,
            "error": "missing issue id",
        }
        return {
            **ticket,
            "development_links": [],
            "pull_requests": [],
            "development_links_error": "missing issue id",
            "development_links_diagnostics": empty_diag,
        }
    result = await get_development_links_with_diagnostics(
        issue_id, ticket.get("key", "")
    )
    return {
        **ticket,
        "development_links": result.links,
        "pull_requests": result.pull_requests,
        "development_links_error": result.error,
        "development_links_diagnostics": result.diagnostics,
    }


def _get_auth() -> tuple[str, str]:
    try:
        from backend.config.settings import get_settings as _gs
    except ImportError:  # pragma: no cover
        from config.settings import get_settings as _gs
    s = _gs()
    return (s.jira_email, s.jira_api_token)


def _base_url() -> str:
    """Return the API base path.

    With Atlassian OAuth we hit api.atlassian.com/ex/jira/{cloud_id}; the
    REST API path lives at /rest/api/3 underneath. The PAT fallback uses
    the configured jira_base_url. Callers append /rest/api/3/... unchanged
    by reading this prefix.
    """
    try:
        from backend.services.auth import identity_service
        from backend.config.settings import get_settings as _gs
    except ImportError:  # pragma: no cover
        from services.auth import identity_service
        from config.settings import get_settings as _gs

    if identity_service.get_oauth_access_token("atlassian"):
        cloud_id, _ = identity_service.get_atlassian_cloud_info()
        if cloud_id:
            return f"https://api.atlassian.com/ex/jira/{cloud_id}"
    return _gs().jira_base_url.rstrip("/")


async def _client() -> httpx.AsyncClient:
    """Build an httpx client that prefers Atlassian OAuth, then PAT."""
    try:
        from backend.services.auth import identity_service
    except ImportError:  # pragma: no cover
        from services.auth import identity_service

    oauth_token = identity_service.get_oauth_access_token("atlassian")
    cloud_id, _ = identity_service.get_atlassian_cloud_info()
    if oauth_token and cloud_id:
        return httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {oauth_token}",
                "Accept": "application/json",
            },
            timeout=30.0,
        )
    email, token = _get_auth()
    return httpx.AsyncClient(
        auth=(email, token),
        headers={"Accept": "application/json"},
        timeout=30.0,
    )


async def get_projects() -> list[dict]:
    async with await _client() as client:
        resp = await client.get(f"{_base_url()}/rest/api/3/project")
        resp.raise_for_status()
        projects = resp.json()

        return [
            {
                "id": p["id"],
                "key": p["key"],
                "name": p["name"],
                "avatar_url": p.get("avatarUrls", {}).get("48x48", ""),
            }
            for p in projects
        ]


_PROJECT_STATUSES_CACHE: dict[str, tuple[float, list[dict]]] = {}
_PROJECT_STATUSES_TTL_S = 300.0


class JiraUnavailableError(RuntimeError):
    pass


class JiraNotFoundError(RuntimeError):
    pass


async def get_project_statuses(project_key: str) -> list[dict]:
    """Return project statuses in **first-seen workflow order**.

    Layer 1 — Workflow Columns: walks issue-type entries in API order,
    then statuses within each type, dedup by name keeping the first
    index. Python 3.7+ dict preserves insertion order, so callers get
    the workflow-relative ordering Jira originally returned (rather
    than the alphabetical sort the legacy implementation produced).

    The route handler turns this list into `workflow_column_order` by
    mapping `[s["name"] for s in result]`.
    """
    import time

    now = time.monotonic()
    cached = _PROJECT_STATUSES_CACHE.get(project_key)
    if cached and now - cached[0] < _PROJECT_STATUSES_TTL_S:
        return cached[1]

    async with await _client() as client:
        resp = await client.get(
            f"{_base_url()}/rest/api/3/project/{project_key}/statuses"
        )
        if resp.status_code == 404:
            raise JiraNotFoundError(project_key)
        if resp.status_code == 429 or resp.status_code >= 500:
            raise JiraUnavailableError(f"jira responded {resp.status_code}")
        resp.raise_for_status()
        raw = resp.json()

    # `accumulator` is a Python 3.7+ dict, which preserves insertion order.
    # That's what gives us the first-seen workflow ordering.
    accumulator: dict[str, dict] = {}
    for issue_type_entry in raw:
        type_name = issue_type_entry.get("name") or ""
        for status in issue_type_entry.get("statuses", []) or []:
            name = status.get("name")
            if not name:
                continue
            category = (
                (status.get("statusCategory") or {}).get("key") or "indeterminate"
            )
            entry = accumulator.get(name)
            if entry is None:
                accumulator[name] = {
                    "name": name,
                    "category": category,
                    "issue_types": [type_name] if type_name else [],
                }
            elif type_name and type_name not in entry["issue_types"]:
                entry["issue_types"].append(type_name)

    ordered = list(accumulator.values())
    _PROJECT_STATUSES_CACHE[project_key] = (now, ordered)
    return ordered


async def get_components(project_key: str) -> list[dict]:
    async with await _client() as client:
        resp = await client.get(
            f"{_base_url()}/rest/api/3/project/{project_key}/components"
        )
        resp.raise_for_status()
        data = resp.json()
    return [
        {
            "id": str(c.get("id", "")),
            "name": c.get("name", ""),
            "description": c.get("description", ""),
        }
        for c in data
        if c.get("name")
    ]


async def get_versions(
    project_key: str,
    status: str = "unreleased",
    order_by: str = "-releaseDate",
    max_results: int = 50,
) -> list[dict]:
    async with await _client() as client:
        params: dict[str, Any] = {
            "maxResults": max_results,
            "startAt": 0,
            "orderBy": order_by,
        }
        if status:
            params["status"] = status

        resp = await client.get(
            f"{_base_url()}/rest/api/3/project/{project_key}/version",
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

        return [
            {
                "id": v["id"],
                "name": v["name"],
                "description": v.get("description", ""),
                "archived": v.get("archived", False),
                "released": v.get("released", False),
                "start_date": v.get("startDate"),
                "release_date": v.get("releaseDate"),
                "overdue": v.get("overdue", False),
                "project_id": v.get("projectId"),
            }
            for v in data.get("values", [])
        ]


FIELDS = [
    "summary",
    "description",
    "status",
    "assignee",
    "reporter",
    "labels",
    "components",
    "fixVersions",
    "issuetype",
    "priority",
    "created",
    "updated",
    "resolution",
    "comment",
    "parent",
]


def _epic_field_name() -> str:
    return get_settings().jira_epic_link_field


def _extract_lane_keys(issue: dict) -> dict:
    fields = issue.get("fields") or {}
    epic_field = _epic_field_name()
    raw_epic = fields.get(epic_field)
    epic_key = raw_epic if isinstance(raw_epic, str) and raw_epic else None

    parent = fields.get("parent") or {}
    parent_key = parent.get("key") if isinstance(parent, dict) else None
    parent_type = (
        (parent.get("fields", {}).get("issuetype") or {}).get("name")
        if isinstance(parent, dict)
        else None
    )
    if not epic_key and parent_key and parent_type == "Epic":
        epic_key = parent_key

    components = fields.get("components") or []
    component_name = None
    if isinstance(components, list) and components:
        first = components[0]
        if isinstance(first, dict):
            component_name = first.get("name")

    return {
        "epic_key": epic_key or None,
        "parent_key": parent_key or None,
        "component_name": component_name or None,
    }


def _extract_adf_text(adf: Any) -> str:
    if isinstance(adf, str):
        return adf
    if not isinstance(adf, dict):
        return ""
    parts = []
    if adf.get("type") == "text":
        parts.append(adf.get("text", ""))
    for child in adf.get("content", []):
        parts.append(_extract_adf_text(child))
    return " ".join(parts).strip()


def _plain_text_to_adf(text: str) -> dict[str, Any]:
    """Convert plain text into minimal Atlassian Document Format."""
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}],
            }
        ],
    }


def _extract_ticket(issue: dict) -> dict:
    fields = issue["fields"]

    comments = []
    comment_data = fields.get("comment", {}) or {}
    for c in comment_data.get("comments", []):
        body = c.get("body", "")
        if isinstance(body, dict):
            body = _extract_adf_text(body)
        comments.append(
            {
                "author": c.get("author", {}).get("displayName", "Unknown"),
                "created": c.get("created", ""),
                "body": body,
            }
        )

    desc_raw = fields.get("description", "") or ""
    description = _extract_adf_text(desc_raw) if isinstance(desc_raw, dict) else str(desc_raw)

    lane_keys = _extract_lane_keys(issue)

    return {
        "key": issue["key"],
        "id": issue["id"],
        "summary": fields.get("summary", ""),
        "status": (fields.get("status") or {}).get("name", ""),
        "issue_type": (fields.get("issuetype") or {}).get("name", ""),
        "priority": (fields.get("priority") or {}).get("name", ""),
        "assignee": (fields.get("assignee") or {}).get("displayName", "Unassigned"),
        "reporter": (fields.get("reporter") or {}).get("displayName", "Unknown"),
        "labels": fields.get("labels", []),
        "components": [c["name"] for c in (fields.get("components") or [])],
        "fix_versions": [v["name"] for v in (fields.get("fixVersions") or [])],
        "resolution": (fields.get("resolution") or {}).get("name", ""),
        "created": fields.get("created", ""),
        "updated": fields.get("updated", ""),
        "description": description,
        "comments": comments,
        "epic_key": lane_keys["epic_key"],
        "parent_key": lane_keys["parent_key"],
        "component_name": lane_keys["component_name"],
    }


async def get_tickets_by_version(fix_version: str) -> list[dict]:
    jql = f'fixVersion = "{fix_version}"'

    async with await _client() as client:
        all_issues: list[dict] = []
        start_at = 0
        max_results = 50
        request_count = 0

        while True:
            if request_count > 0:
                await asyncio.sleep(REQUEST_DELAY_SECONDS)

            resp = await client.get(
                f"{_base_url()}/rest/api/3/search/jql",
                params={
                    "jql": jql,
                    "startAt": start_at,
                    "maxResults": max_results,
                    "fields": ",".join(FIELDS),
                },
            )
            request_count += 1

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 60))
                await asyncio.sleep(retry_after)
                continue

            resp.raise_for_status()
            data = resp.json()

            all_issues.extend(data["issues"])
            total = data.get("total", len(all_issues))

            if len(all_issues) >= total:
                break
            start_at += max_results

        tickets = [_extract_ticket(issue) for issue in all_issues]
        tickets.sort(key=lambda t: int(t["key"].split("-")[-1]))
        return tickets


async def get_tickets_by_keys(ticket_keys: list[str]) -> list[dict]:
    if not ticket_keys:
        return []

    keys_str = ", ".join(ticket_keys)
    jql = f"key in ({keys_str})"

    async with await _client() as client:
        all_issues: list[dict] = []
        start_at = 0
        max_results = 50

        while True:
            resp = await client.get(
                f"{_base_url()}/rest/api/3/search/jql",
                params={
                    "jql": jql,
                    "startAt": start_at,
                    "maxResults": max_results,
                    "fields": ",".join(FIELDS),
                },
            )
            resp.raise_for_status()
            data = resp.json()

            all_issues.extend(data.get("issues", []))
            total = data.get("total", len(all_issues))
            if len(all_issues) >= total:
                break
            start_at += max_results

        tickets = [_extract_ticket(issue) for issue in all_issues]
        tickets.sort(key=lambda t: int(t["key"].split("-")[-1]))

    # Enrich with dev-status PRs using bounded concurrency.
    sem = asyncio.Semaphore(6)

    async def _enrich(t: dict) -> dict:
        async with sem:
            return await _enrich_ticket_with_development_links(t)

    enriched = await asyncio.gather(*[_enrich(t) for t in tickets])
    return list(enriched)


async def get_board(jql: str, fields: Optional[list[str]] = None) -> dict:
    """Fetch tickets matching `jql`, grouped by Jira status name."""
    use_fields = list(fields or FIELDS)
    epic_field = _epic_field_name()
    if epic_field and epic_field not in use_fields:
        use_fields.append(epic_field)
    async with await _client() as client:
        all_issues: list[dict] = []
        start_at = 0
        max_results = 50
        request_count = 0

        while True:
            if request_count > 0:
                await asyncio.sleep(REQUEST_DELAY_SECONDS)

            resp = await client.get(
                f"{_base_url()}/rest/api/3/search/jql",
                params={
                    "jql": jql,
                    "startAt": start_at,
                    "maxResults": max_results,
                    "fields": ",".join(use_fields),
                },
            )
            request_count += 1

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 60))
                await asyncio.sleep(retry_after)
                continue

            resp.raise_for_status()
            data = resp.json()
            all_issues.extend(data.get("issues", []))
            total = data.get("total", len(all_issues))
            if len(all_issues) >= total:
                break
            start_at += max_results

    tickets = [_extract_ticket(issue) for issue in all_issues]
    by_status: dict[str, list[dict]] = {}
    for t in tickets:
        by_status.setdefault(t["status"] or "Unknown", []).append(t)

    return {
        "total": len(tickets),
        "by_status": by_status,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


async def post_comment(ticket_key: str, body: str) -> dict:
    """Add a comment to a Jira issue. Returns sanitized comment metadata."""
    async with await _client() as client:
        resp = await client.post(
            f"{_base_url()}/rest/api/3/issue/{ticket_key}/comment",
            json={"body": _plain_text_to_adf(body)},
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "id": data["id"],
        "author": (data.get("author") or {}).get("displayName", "Unknown"),
        "created": data.get("created", ""),
    }


async def set_test_cases_field(
    ticket_key: str,
    body: str,
    field_id: str = "customfield_11001",
) -> dict:
    """Write `body` into a Jira issue's Test Cases custom field.

    Although this field reports as textarea/string, Jira Cloud requires
    Atlassian Document Format (ADF) for writes. Jira's
    `PUT /rest/api/3/issue/{key}` returns 204 No Content on success and
    does not echo the new value, so we synthesize a sanitized
    confirmation payload (field id, ticket key, write timestamp) that
    the publish service can persist.
    """
    written_at = datetime.now(timezone.utc).isoformat()
    async with await _client() as client:
        resp = await client.put(
            f"{_base_url()}/rest/api/3/issue/{ticket_key}",
            json={"fields": {field_id: _plain_text_to_adf(body)}},
            headers={"Content-Type": "application/json"},
        )
        if resp.status_code not in (200, 204):
            resp.raise_for_status()
    return {
        "field_id": field_id,
        "ticket_key": ticket_key,
        "updated_at": written_at,
    }


async def get_transitions(ticket_key: str) -> list[dict]:
    async with await _client() as client:
        resp = await client.get(
            f"{_base_url()}/rest/api/3/issue/{ticket_key}/transitions"
        )
        resp.raise_for_status()
        data = resp.json()
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "to": {
                "id": (t.get("to") or {}).get("id", ""),
                "name": (t.get("to") or {}).get("name", ""),
            },
        }
        for t in data.get("transitions", [])
    ]


async def get_status(ticket_key: str) -> str:
    """Cheap one-field fetch for idempotency check."""
    async with await _client() as client:
        resp = await client.get(
            f"{_base_url()}/rest/api/3/issue/{ticket_key}",
            params={"fields": "status"},
        )
        resp.raise_for_status()
        data = resp.json()
    return ((data.get("fields") or {}).get("status") or {}).get("name", "")


async def do_transition(ticket_key: str, transition_id: str) -> None:
    async with await _client() as client:
        resp = await client.post(
            f"{_base_url()}/rest/api/3/issue/{ticket_key}/transitions",
            json={"transition": {"id": transition_id}},
            headers={"Content-Type": "application/json"},
        )
        if resp.status_code not in (200, 204):
            resp.raise_for_status()
