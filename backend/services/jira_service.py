import asyncio
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

try:
    from backend.config.settings import get_settings
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.settings import get_settings

REQUEST_DELAY_SECONDS = 1.5


def _get_auth() -> tuple[str, str]:
    s = get_settings()
    return (s.jira_email, s.jira_api_token)


def _base_url() -> str:
    return get_settings().jira_base_url.rstrip("/")


async def _client() -> httpx.AsyncClient:
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

    ordered = sorted(accumulator.values(), key=lambda r: r["name"].lower())
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
        return tickets


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
