"""Zephyr read adapter — Phase 3.

Looks up existing Zephyr test cases linked to a ticket so the generator
can avoid producing duplicates. Uses Zephyr's REST search API filtered
by Jira ticket key. Falls back to AdapterUnavailable when Zephyr is not
configured so the orchestrator records a skip rather than aborting.
"""

from __future__ import annotations

import httpx

from .base import AdapterUnavailable, ZephyrReadAdapter

try:
    from backend.config.settings import get_settings
    from backend.schemas.context_bundle_models import ExistingTest, ExistingTests
except ImportError:  # pragma: no cover
    from config.settings import get_settings
    from schemas.context_bundle_models import ExistingTest, ExistingTests


class ZephyrRestReadAdapter(ZephyrReadAdapter):
    """Concrete Zephyr-Scale read adapter for dedupe hints."""

    async def health(self) -> bool:
        s = get_settings()
        return bool(s.zephyr_api_token and s.zephyr_base_url)

    async def list_existing_tests(self, ticket_key: str) -> ExistingTests:
        s = get_settings()
        if not s.zephyr_api_token:
            raise AdapterUnavailable("zephyr_read", "no Zephyr token configured")
        if not ticket_key:
            return ExistingTests()

        headers = {
            "Authorization": f"Bearer {s.zephyr_api_token}",
            "Accept": "application/json",
        }
        base = s.zephyr_base_url.rstrip("/")

        # Zephyr Scale Cloud exposes /testcases with a query filter; project
        # key is derived from the ticket key prefix.
        project_key = ticket_key.split("-", 1)[0] if "-" in ticket_key else ""
        params = {"projectKey": project_key, "maxResults": 25}

        try:
            async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
                resp = await client.get(f"{base}/testcases", params=params)
                if resp.status_code >= 400:
                    raise AdapterUnavailable(
                        "zephyr_read", f"http {resp.status_code}"
                    )
                data = resp.json()
        except httpx.HTTPError as exc:
            raise AdapterUnavailable("zephyr_read", f"http: {type(exc).__name__}")

        values = data.get("values") if isinstance(data, dict) else None
        if not isinstance(values, list):
            return ExistingTests()

        tests: list[ExistingTest] = []
        needle = ticket_key.lower()
        for tc in values:
            if not isinstance(tc, dict):
                continue
            # Heuristic match: the ticket key appears in the case name or labels.
            name = str(tc.get("name", "") or "")
            labels = tc.get("labels") or []
            label_blob = " ".join(str(l) for l in labels).lower()
            if needle not in name.lower() and needle not in label_blob:
                continue
            tests.append(
                ExistingTest(
                    key=str(tc.get("key", "") or ""),
                    name=name,
                    last_status=str(tc.get("status", "") or ""),
                )
            )

        tests.sort(key=lambda t: (t.key, t.name))
        return ExistingTests(tests=tests)


ZephyrReadAdapterStub = ZephyrRestReadAdapter
