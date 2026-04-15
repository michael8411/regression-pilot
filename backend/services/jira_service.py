import asyncio
from typing import Any

import httpx

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
]


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
    keys_str = ", ".join(ticket_keys)
    jql = f"key in ({keys_str})"

    async with await _client() as client:
        resp = await client.get(
            f"{_base_url()}/rest/api/3/search/jql",
            params={
                "jql": jql,
                "startAt": 0,
                "maxResults": 50,
                "fields": ",".join(FIELDS),
            },
        )
        resp.raise_for_status()
        data = resp.json()

        tickets = [_extract_ticket(issue) for issue in data["issues"]]
        tickets.sort(key=lambda t: int(t["key"].split("-")[-1]))
        return tickets
