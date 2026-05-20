"""Phase 06b — route-level coverage for the publish-to-Jira endpoint.

Replaces the Phase 01 501 stub. These tests assert:

  * happy-path response shape (linked test cases),
  * Jira comment fallback response shape,
  * partial-publish reporting,
  * typed validation errors (404/400/409),
  * duplicate-publish gating,
  * no 501 stub remains.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "live_publish_routes_test.db"


@pytest.fixture
def live_client(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod

    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db

    asyncio.run(init_db())

    from api.live_routes import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _seed(client) -> str:
    """Seed a generated case set via the public API and return its id."""
    r = client.post(
        "/live/generated-cases",
        json={
            "ticket_key": "FM-9",
            "instructions": "i",
            "cases": [
                {"name": "Happy", "priority": "High", "objective": "main"},
                {"name": "Edge", "priority": "Medium", "objective": "edge"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _publish_body(**overrides):
    body = {
        "ticket_key": "FM-9",
        "project_key": "FM",
        "case_indexes": None,
        "mode": "linked_test_cases",
        "fallback_to_comment": True,
        "folder_id": None,
        "confirm_duplicate": False,
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------


class TestPublishSuccess:

    def test_linked_publish_response_shape(self, live_client, monkeypatch):
        import services.zephyr_service as zephyr

        async def fake_bulk(
            *, project_key, test_cases, folder_id=None, issue_links=None
        ):
            assert project_key == "FM"
            assert issue_links == ["FM-9"]
            return {
                "created": [
                    {"name": tc["name"], "key": f"FM-T{i}", "id": str(i)}
                    for i, tc in enumerate(test_cases, start=1)
                ],
                "failed": [],
            }

        monkeypatch.setattr(zephyr, "create_test_cases_bulk", fake_bulk)
        cid = _seed(live_client)
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish", json=_publish_body()
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "exported"
        assert body["target"] == "zephyr_linked_tests"
        assert body["created"] == 2
        assert body["appears_on_jira_ticket"] is True
        assert {tc["key"] for tc in body["created_test_cases"]} == {
            "FM-T1",
            "FM-T2",
        }
        assert body["failed"] == []
        assert body["exported_at"]

    def test_partial_publish_returns_partial_export(self, live_client, monkeypatch):
        import services.zephyr_service as zephyr

        async def fake_bulk(*, project_key, test_cases, folder_id, issue_links):
            return {
                "created": [{"name": test_cases[0]["name"], "key": "K1", "id": "1"}],
                "failed": [{"name": test_cases[1]["name"], "error": "boom"}],
            }

        monkeypatch.setattr(zephyr, "create_test_cases_bulk", fake_bulk)
        cid = _seed(live_client)
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish", json=_publish_body()
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "partial_export"
        assert body["created"] == 1
        assert len(body["failed"]) == 1


# ---------------------------------------------------------------------------
# Fallback
# ---------------------------------------------------------------------------


class TestPublishFallback:

    def test_explicit_comment_mode_returns_commented(self, live_client, monkeypatch):
        import services.jira_service as jira

        async def fake_comment(ticket_key, body):
            return {
                "id": "c1",
                "author": "Test",
                "created": "2026-05-16T00:00:00Z",
            }

        monkeypatch.setattr(jira, "post_comment", fake_comment)
        cid = _seed(live_client)
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish",
            json=_publish_body(mode="jira_comment"),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "commented"
        assert body["target"] == "jira_comment"
        assert body["appears_on_jira_ticket"] is False
        assert body["jira_comment"]["id"] == "c1"

    def test_zephyr_failure_falls_back_when_enabled(
        self, live_client, monkeypatch
    ):
        import services.zephyr_service as zephyr
        import services.jira_service as jira

        async def boom(**_):
            raise RuntimeError("zephyr offline")

        async def fake_comment(ticket_key, body):
            return {"id": "c2", "author": None, "created": None}

        monkeypatch.setattr(zephyr, "create_test_cases_bulk", boom)
        monkeypatch.setattr(jira, "post_comment", fake_comment)
        cid = _seed(live_client)
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish", json=_publish_body()
        )
        assert r.status_code == 200
        assert r.json()["status"] == "commented"

    def test_zephyr_failure_without_fallback_keeps_draft(
        self, live_client, monkeypatch
    ):
        import services.zephyr_service as zephyr

        async def boom(**_):
            raise RuntimeError("zephyr offline")

        monkeypatch.setattr(zephyr, "create_test_cases_bulk", boom)
        cid = _seed(live_client)
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish",
            json=_publish_body(fallback_to_comment=False),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "draft"
        assert body["target"] == "none"
        assert body["appears_on_jira_ticket"] is False


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------


class TestPublishValidation:

    def test_unknown_case_set_returns_404(self, live_client):
        r = live_client.post(
            "/live/generated-cases/does-not-exist/publish",
            json=_publish_body(),
        )
        assert r.status_code == 404

    def test_invalid_case_index_returns_400(self, live_client):
        cid = _seed(live_client)
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish",
            json=_publish_body(case_indexes=[99]),
        )
        assert r.status_code == 400

    def test_missing_ticket_key_returns_422(self, live_client):
        cid = _seed(live_client)
        body = _publish_body()
        body.pop("ticket_key")
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish", json=body
        )
        # Pydantic rejects the request before it reaches the service —
        # FastAPI maps this to 422.
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# Duplicate publish + stub regression check
# ---------------------------------------------------------------------------


class TestDuplicateProtection:

    def test_duplicate_returns_409_until_confirmed(
        self, live_client, monkeypatch
    ):
        import services.zephyr_service as zephyr

        async def fake_bulk(**_):
            return {
                "created": [{"name": "x", "key": "K", "id": "1"}],
                "failed": [],
            }

        monkeypatch.setattr(zephyr, "create_test_cases_bulk", fake_bulk)
        cid = _seed(live_client)
        first = live_client.post(
            f"/live/generated-cases/{cid}/publish",
            json=_publish_body(case_indexes=[0]),
        )
        assert first.status_code == 200

        second = live_client.post(
            f"/live/generated-cases/{cid}/publish",
            json=_publish_body(case_indexes=[0]),
        )
        assert second.status_code == 409

        confirmed = live_client.post(
            f"/live/generated-cases/{cid}/publish",
            json=_publish_body(case_indexes=[0], confirm_duplicate=True),
        )
        assert confirmed.status_code == 200
        assert confirmed.json()["duplicate_attempt"] is True


class TestStubRemoved:

    def test_no_501_response_on_publish(self, live_client):
        # Any POST against a known case set must NOT return 501.
        cid = _seed(live_client)
        # Send a minimally-broken body so the route runs validation and the
        # service rejects it — but never with 501.
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish",
            json=_publish_body(case_indexes=[999]),
        )
        assert r.status_code != 501


# ---------------------------------------------------------------------------
# Phase 06c — Live publish defaults to Jira comment
# ---------------------------------------------------------------------------


class TestPhase06cFieldDefault:

    def test_request_without_mode_writes_to_test_cases_field(
        self, live_client, monkeypatch
    ):
        import services.jira_service as jira
        import services.zephyr_service as zephyr

        captured = {}

        async def fake_field(ticket_key, body, field_id="customfield_11001"):
            captured["ticket_key"] = ticket_key
            captured["body"] = body
            captured["field_id"] = field_id
            return {
                "field_id": field_id,
                "ticket_key": ticket_key,
                "updated_at": "2026-05-17T12:00:00Z",
            }

        async def fake_comment(*_, **__):
            raise AssertionError("default publish must not post a comment")

        async def fake_bulk(**_):
            raise AssertionError("default publish must not touch Zephyr")

        monkeypatch.setattr(jira, "set_test_cases_field", fake_field)
        monkeypatch.setattr(jira, "post_comment", fake_comment)
        monkeypatch.setattr(zephyr, "create_test_cases_bulk", fake_bulk)

        cid = _seed(live_client)
        body = {"ticket_key": "FM-9", "project_key": "FM"}
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish", json=body
        )
        assert r.status_code == 200, r.text
        payload = r.json()
        assert payload["status"] == "exported"
        assert payload["target"] == "jira_test_cases_field"
        assert payload["appears_on_jira_ticket"] is True
        assert payload["jira_field"]["field_id"] == "customfield_11001"
        assert captured["field_id"] == "customfield_11001"
        assert "Testdeck generated test cases" in captured["body"]

    def test_field_failure_falls_back_to_comment(
        self, live_client, monkeypatch
    ):
        import services.jira_service as jira

        async def boom(*_, **__):
            raise RuntimeError("jira 500 on field edit")

        async def fake_comment(ticket_key, body):
            return {"id": "c-fb", "author": None, "created": None}

        monkeypatch.setattr(jira, "set_test_cases_field", boom)
        monkeypatch.setattr(jira, "post_comment", fake_comment)

        cid = _seed(live_client)
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish",
            json={"ticket_key": "FM-9", "project_key": "FM"},
        )
        assert r.status_code == 200
        payload = r.json()
        assert payload["target"] == "jira_comment"
        assert payload["status"] == "commented"


class TestPhase06cBodyOverride:

    def test_body_override_used_for_field_write(
        self, live_client, monkeypatch
    ):
        import services.jira_service as jira

        captured = {}

        async def fake_field(ticket_key, body, field_id="customfield_11001"):
            captured["body"] = body
            return {
                "field_id": field_id,
                "ticket_key": ticket_key,
                "updated_at": None,
            }

        monkeypatch.setattr(jira, "set_test_cases_field", fake_field)

        cid = _seed(live_client)
        override = "Frontend-rendered preview body, used verbatim.\n"
        r = live_client.post(
            f"/live/generated-cases/{cid}/publish",
            json=_publish_body(
                mode="jira_test_cases_field", body=override
            ),
        )
        assert r.status_code == 200
        assert captured["body"] == override


# ---------------------------------------------------------------------------
# Phase 06c — per-case partial updates via PATCH
# ---------------------------------------------------------------------------


class TestPhase06cCaseUpdatesEndpoint:

    def test_patch_with_case_updates_replaces_one_case(self, live_client):
        cid = _seed(live_client)
        r = live_client.patch(
            f"/live/generated-cases/{cid}",
            json={
                "case_updates": [
                    {
                        "index": 0,
                        "case": {
                            "name": "Happy (edited)",
                            "priority": "Critical",
                            "objective": "main + audit",
                        },
                    }
                ]
            },
        )
        assert r.status_code == 200, r.text
        cases = r.json()["cases"]
        assert cases[0]["name"] == "Happy (edited)"
        assert cases[1]["name"] == "Edge"

    def test_patch_with_case_updates_out_of_range_returns_400(
        self, live_client
    ):
        cid = _seed(live_client)
        r = live_client.patch(
            f"/live/generated-cases/{cid}",
            json={
                "case_updates": [
                    {"index": 99, "case": {"name": "nope"}}
                ]
            },
        )
        assert r.status_code == 400
