from typing import Any

import httpx

from config import get_settings


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
) -> dict:
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
            await _add_test_steps(client, test_case["key"], steps)

        return test_case


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
) -> list[dict]:
    results = []
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

        result = await create_test_case(
            project_key=project_key,
            name=tc.get("name", "Untitled Test Case"),
            objective=tc.get("objective", ""),
            preconditions=preconditions,
            priority=priority_map.get(tc.get("priority", "Medium"), "Normal"),
            labels=tc.get("labels", []),
            steps=tc.get("steps", []),
            folder_id=folder_id,
        )
        results.append(result)

    return results


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
