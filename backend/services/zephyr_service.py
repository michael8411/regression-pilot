from typing import Any

import httpx

try:
    from backend.config.settings import get_settings
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.settings import get_settings


class ZephyrStepUploadError(Exception):
    def __init__(self, message: str, *, created_test_case: dict):
        super().__init__(message)
        self.created_test_case = created_test_case


class ZephyrIssueLinkError(Exception):
    """Raised when a test case was created but linking to the Jira issue failed.

    The created test case is preserved so the caller can decide whether the
    publish attempt counts as a partial success (the test exists in Zephyr but
    will not appear in the Jira ticket's Test Cases panel).
    """

    def __init__(self, message: str, *, created_test_case: dict):
        super().__init__(message)
        self.created_test_case = created_test_case


def _base_url() -> str:
    return get_settings().zephyr_base_url.rstrip("/")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {get_settings().zephyr_api_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def create_test_case(
    project_key: str,
    name: str,
    objective: str = "",
    preconditions: str = "",
    priority: str = "Normal",
    labels: list[str] | None = None,
    steps: list[dict] | None = None,
    folder_id: int | None = None,
    issue_links: list[str] | None = None,
) -> dict:
    """Create a Zephyr test case and optionally link it to Jira issues.

    `issue_links` is a list of Jira issue keys to link to the new test case.
    Phase 06b passes the source Jira ticket key so the case appears in that
    ticket's Test Cases panel where Zephyr exposes linked tests.
    """
    payload: dict[str, Any] = {
        "projectKey": project_key,
        "name": name,
        "objective": objective,
        "precondition": preconditions,
        "priorityName": priority,
        "statusName": "Draft",
    }

    if labels:
        payload["labels"] = labels

    if folder_id:
        payload["folderId"] = folder_id

    async with httpx.AsyncClient(headers=_headers(), timeout=30.0) as client:
        resp = await client.post(f"{_base_url()}/testcases", json=payload)
        resp.raise_for_status()
        test_case = resp.json()

        if steps and test_case.get("key"):
            try:
                await _add_test_steps(client, test_case["key"], steps)
            except Exception as exc:
                key = test_case.get("key", "unknown")
                raise ZephyrStepUploadError(
                    f"Created test case {key}, but failed to upload steps: {exc}",
                    created_test_case=test_case,
                ) from exc

        if issue_links and test_case.get("key"):
            try:
                await _link_to_issues(client, test_case["key"], issue_links)
            except Exception as exc:
                key = test_case.get("key", "unknown")
                raise ZephyrIssueLinkError(
                    f"Created test case {key}, but failed to link to {issue_links}: {exc}",
                    created_test_case=test_case,
                ) from exc

        return test_case


async def _link_to_issues(
    client: httpx.AsyncClient,
    test_case_key: str,
    issue_keys: list[str],
) -> None:
    """Attach Jira issue links to a Zephyr test case.

    Uses Zephyr Scale's `POST /testcases/{key}/links/issues` endpoint with a
    `{"issueKey": "..."}` payload per call. The route name mirrors the
    Phase 06b "issueLinks" semantic.
    """
    url = f"{_base_url()}/testcases/{test_case_key}/links/issues"
    for issue_key in issue_keys:
        resp = await client.post(url, json={"issueKey": issue_key})
        resp.raise_for_status()


async def _add_test_steps(
    client: httpx.AsyncClient,
    test_case_key: str,
    steps: list[dict],
) -> None:
    step_items = []
    for step in steps:
        step_items.append(
            {
                "inline": {
                    "description": step.get("action", ""),
                    "testData": step.get("test_data", ""),
                    "expectedResult": step.get("expected_result", ""),
                }
            }
        )

    payload = {
        "mode": "OVERWRITE",
        "items": step_items,
    }

    resp = await client.post(
        f"{_base_url()}/testcases/{test_case_key}/teststeps",
        json=payload,
    )
    resp.raise_for_status()


async def create_test_cases_bulk(
    project_key: str,
    test_cases: list[dict],
    folder_id: int | None = None,
    issue_links: list[str] | None = None,
) -> dict[str, list[dict]]:
    """Bulk-create Zephyr test cases.

    Each created case can optionally be linked to a fixed set of Jira issues
    via `issue_links` (Phase 06b: pass `[source_ticket_key]`). When a single
    case fails (creation, step upload, or issue linking) the failure is
    captured in the `failed` list and bulk processing continues so a partial
    publish can be reported back to the caller.
    """
    created: list[dict] = []
    failed: list[dict] = []
    for tc in test_cases:
        preconditions = ""
        if tc.get("preconditions"):
            if isinstance(tc["preconditions"], list):
                preconditions = "<ul>" + "".join(f"<li>{p}</li>" for p in tc["preconditions"]) + "</ul>"
            else:
                preconditions = str(tc["preconditions"])

        priority_map = {
            "Critical": "High",
            "High": "High",
            "Medium": "Normal",
            "Low": "Low",
        }

        name = tc.get("name", "Untitled Test Case")
        try:
            result = await create_test_case(
                project_key=project_key,
                name=name,
                objective=tc.get("objective", ""),
                preconditions=preconditions,
                priority=priority_map.get(tc.get("priority", "Medium"), "Normal"),
                labels=tc.get("labels", []),
                steps=tc.get("steps", []),
                folder_id=folder_id,
                issue_links=issue_links,
            )
            created.append(result)
        except ZephyrStepUploadError as exc:
            failed.append(
                {
                    "name": name,
                    "error": str(exc),
                    "created_test_case": exc.created_test_case,
                }
            )
        except ZephyrIssueLinkError as exc:
            # The case was created but the Jira issue link failed. Surface
            # this as a typed partial failure so the publish service can
            # report "won't appear on the ticket" honestly.
            failed.append(
                {
                    "name": name,
                    "error": str(exc),
                    "created_test_case": exc.created_test_case,
                    "issue_link_failed": True,
                }
            )
        except Exception as exc:
            failed.append({"name": name, "error": str(exc)})

    return {"created": created, "failed": failed}


async def get_folders(project_key: str) -> list[dict]:
    async with httpx.AsyncClient(headers=_headers(), timeout=30.0) as client:
        resp = await client.get(
            f"{_base_url()}/folders",
            params={
                "projectKey": project_key,
                "folderType": "TEST_CASE",
                "maxResults": 100,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("values", [])
