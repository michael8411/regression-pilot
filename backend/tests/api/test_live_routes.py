import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "live_routes_test.db"


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


class TestBoardCRUD:

    def test_create_board(self, live_client):
        r = live_client.post(
            "/live/boards", json={"name": "QA", "jql": "project = FM"}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "QA"
        assert "id" in body

    def test_create_board_400_on_secret_name(self, live_client):
        r = live_client.post(
            "/live/boards",
            json={
                "name": "AccountKey=" + "B" * 86 + "==",
                "jql": "project = FM",
            },
        )
        assert r.status_code == 400
        assert "secret" in r.json()["detail"].lower()

    def test_create_board_400_on_empty_name(self, live_client):
        r = live_client.post("/live/boards", json={"name": "  ", "jql": "x"})
        assert r.status_code == 400

    def test_list_empty(self, live_client):
        r = live_client.get("/live/boards")
        assert r.status_code == 200
        assert r.json() == []

    def test_get_unknown_board_404(self, live_client):
        r = live_client.get("/live/boards/does-not-exist")
        assert r.status_code == 404

    def test_patch_pinned(self, live_client):
        bid = live_client.post(
            "/live/boards", json={"name": "A", "jql": "x"}
        ).json()["id"]
        r = live_client.patch(f"/live/boards/{bid}", json={"pinned": True})
        assert r.status_code == 200
        assert r.json()["pinned"] is True

    def test_patch_unknown_404(self, live_client):
        r = live_client.patch(
            "/live/boards/does-not-exist", json={"pinned": True}
        )
        assert r.status_code == 404

    def test_patch_400_on_secret_name(self, live_client):
        bid = live_client.post(
            "/live/boards", json={"name": "A", "jql": "x"}
        ).json()["id"]
        r = live_client.patch(
            f"/live/boards/{bid}",
            json={"name": "AccountKey=" + "C" * 86 + "=="},
        )
        assert r.status_code == 400

    def test_delete_board(self, live_client):
        bid = live_client.post(
            "/live/boards", json={"name": "A", "jql": "x"}
        ).json()["id"]
        assert live_client.delete(f"/live/boards/{bid}").json()["deleted"] is True
        assert live_client.get(f"/live/boards/{bid}").status_code == 404

    def test_delete_unknown_returns_false(self, live_client):
        r = live_client.delete("/live/boards/does-not-exist")
        assert r.status_code == 200
        assert r.json()["deleted"] is False


class TestLiveGenerate:

    def test_calls_ai_service(self, live_client, monkeypatch):
        """Legacy direct-ticket path (use_context_bundle=False)."""
        import services.ai_service as ai

        async def fake_generate(tickets, instructions):
            assert len(tickets) == 1
            assert tickets[0]["key"] == "FM-1"
            return {"test_cases": [{"name": "smoke"}]}

        monkeypatch.setattr(ai, "generate_test_cases", fake_generate)
        r = live_client.post(
            "/live/generate",
            json={
                "ticket": {"key": "FM-1", "summary": "x"},
                "use_context_bundle": False,
            },
        )
        assert r.status_code == 200
        assert r.json()["test_cases"][0]["name"] == "smoke"

    def test_routed_path_returns_context_metadata(self, live_client, monkeypatch):
        """Phase 3 default: routed pipeline returns context_metadata."""
        import services.ai_service as ai

        async def fake_from_bundle(bundle, instructions):
            return {"test_cases": [{"name": "routed"}]}

        monkeypatch.setattr(ai, "generate_test_cases_from_bundle", fake_from_bundle)
        r = live_client.post(
            "/live/generate",
            json={"ticket": {"key": "FM-1", "summary": "x"}},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["test_cases"][0]["name"] == "routed"
        meta = body.get("context_metadata")
        assert meta is not None
        assert "routing_decisions" in meta
        assert meta["hard_cap_chars"] > 0

    def test_502_on_ai_failure(self, live_client, monkeypatch):
        import services.ai_service as ai

        async def fake_generate(tickets, instructions):
            raise RuntimeError("model down")

        monkeypatch.setattr(ai, "generate_test_cases", fake_generate)
        r = live_client.post(
            "/live/generate",
            json={"ticket": {"key": "FM-1"}, "use_context_bundle": False},
        )
        assert r.status_code == 502


# =============================================================================
# Phase 08 additions — artifact CRUD + publish stub + profile/view_prefs
# =============================================================================


class TestBoardProfileAndViewPrefs:
    """Round-trip the Phase 01 board profile + view_prefs through the API."""

    def test_create_with_profile_and_view_prefs(self, live_client):
        body = {
            "name": "FM in QA",
            "jql": "project = FM",
            "profile": {
                "builderMode": "simple",
                "projectKey": "FM",
                "versionName": "v1",
                "selectedStatuses": ["Ready for QA"],
            },
            "view_prefs": {
                "homeFilter": "active",
                "boardColumnMode": "qa",
                "density": "cozy",
            },
        }
        r = live_client.post("/live/boards", json=body)
        assert r.status_code == 200
        out = r.json()
        assert out["profile"]["projectKey"] == "FM"
        assert out["view_prefs"]["homeFilter"] == "active"

        # Reload and verify the profile and view_prefs round-trip via the
        # encrypted store rather than the create-time response.
        bid = out["id"]
        fresh = live_client.get(f"/live/boards/{bid}").json()
        assert fresh["profile"]["versionName"] == "v1"
        assert fresh["view_prefs"]["density"] == "cozy"

    def test_patch_view_prefs_persists(self, live_client):
        bid = live_client.post(
            "/live/boards",
            json={
                "name": "B",
                "jql": "x",
                "view_prefs": {
                    "homeFilter": "",
                    "boardColumnMode": "qa",
                    "density": "cozy",
                },
            },
        ).json()["id"]
        r = live_client.patch(
            f"/live/boards/{bid}",
            json={
                "view_prefs": {
                    "homeFilter": "stuck",
                    "boardColumnMode": "all",
                    "density": "roomy",
                }
            },
        )
        assert r.status_code == 200
        fresh = live_client.get(f"/live/boards/{bid}").json()
        assert fresh["view_prefs"]["homeFilter"] == "stuck"
        assert fresh["view_prefs"]["boardColumnMode"] == "all"
        assert fresh["view_prefs"]["density"] == "roomy"


class TestPhase13ViewPrefsAdditive:

    def test_legacy_board_without_view_prefs_round_trips(self, live_client):
        # Create with only the minimum payload (no view_prefs at all).
        bid = live_client.post(
            "/live/boards", json={"name": "Legacy", "jql": "project = FM"}
        ).json()["id"]
        fresh = live_client.get(f"/live/boards/{bid}").json()
        # Legacy rows return None for view_prefs (no write-back happened).
        assert fresh["view_prefs"] is None

    def test_show_empty_non_qa_columns_round_trips(self, live_client):
        bid = live_client.post(
            "/live/boards",
            json={
                "name": "B",
                "jql": "x",
                "view_prefs": {
                    "homeFilter": "",
                    "boardColumnMode": "all",
                    "density": "cozy",
                    "showEmptyNonQaColumns": True,
                },
            },
        ).json()["id"]
        fresh = live_client.get(f"/live/boards/{bid}").json()
        assert fresh["view_prefs"]["showEmptyNonQaColumns"] is True

    def test_collapsed_lane_keys_round_trip(self, live_client):
        bid = live_client.post(
            "/live/boards",
            json={
                "name": "B",
                "jql": "x",
                "view_prefs": {
                    "homeFilter": "",
                    "boardColumnMode": "qa",
                    "density": "cozy",
                    "collapsedLaneKeys": ["FM-1", "FM-2"],
                },
            },
        ).json()["id"]
        fresh = live_client.get(f"/live/boards/{bid}").json()
        assert fresh["view_prefs"]["collapsedLaneKeys"] == ["FM-1", "FM-2"]


class TestPhase13ProjectStatusesRoute:

    @pytest.fixture
    def jira_client(self, fake_keyring, monkeypatch):
        from api import jira_routes

        app = FastAPI()
        app.include_router(jira_routes.router)
        return TestClient(app)

    def setup_method(self):
        from services import jira_service

        jira_service._PROJECT_STATUSES_CACHE.clear()

    def test_returns_response_shape(self, jira_client, monkeypatch):
        from services import jira_service

        async def fake_get(*_a, **_k):
            return [
                {
                    "name": "Done",
                    "category": "done",
                    "issue_types": ["Story", "Bug"],
                },
                {
                    "name": "In Progress",
                    "category": "indeterminate",
                    "issue_types": ["Story"],
                },
            ]

        monkeypatch.setattr(jira_service, "get_project_statuses", fake_get)
        r = jira_client.get("/jira/projects/FM/statuses")
        assert r.status_code == 200
        body = r.json()
        assert body["project_key"] == "FM"
        assert body["statuses"][0]["name"] == "Done"
        assert body["fetched_at"]

    def test_unknown_project_returns_404(self, jira_client, monkeypatch):
        from services import jira_service

        async def boom(*_a, **_k):
            raise jira_service.JiraNotFoundError("BAD")

        monkeypatch.setattr(jira_service, "get_project_statuses", boom)
        r = jira_client.get("/jira/projects/BAD/statuses")
        assert r.status_code == 404
        assert r.json() == {"error": "project_not_found"}

    def test_jira_5xx_returns_502(self, jira_client, monkeypatch):
        from services import jira_service

        async def boom(*_a, **_k):
            raise jira_service.JiraUnavailableError("503")

        monkeypatch.setattr(jira_service, "get_project_statuses", boom)
        r = jira_client.get("/jira/projects/FM/statuses")
        assert r.status_code == 502
        assert r.json() == {"error": "jira_unavailable"}


class TestPhase13BoardPreviewLaneKeys:

    def test_preview_returns_lane_keys(self, live_client, monkeypatch):
        from api import jira_routes
        from services import jira_service

        async def fake_get_board(jql, fields=None):
            return {
                "total": 1,
                "by_status": {
                    "In Progress": [
                        {
                            "key": "FM-1",
                            "id": "1",
                            "summary": "x",
                            "status": "In Progress",
                            "issue_type": "Bug",
                            "priority": "High",
                            "assignee": "U",
                            "reporter": "R",
                            "labels": [],
                            "components": ["Mobile"],
                            "fix_versions": [],
                            "resolution": "",
                            "created": "",
                            "updated": "",
                            "description": "",
                            "comments": [],
                            "epic_key": "FM-100",
                            "parent_key": None,
                            "component_name": "Mobile",
                        }
                    ]
                },
                "fetched_at": "2026-05-18T00:00:00Z",
            }

        monkeypatch.setattr(jira_service, "get_board", fake_get_board)

        app = FastAPI()
        app.include_router(jira_routes.router)
        client = TestClient(app)
        r = client.get("/jira/board?jql=project%20%3D%20FM")
        assert r.status_code == 200
        body = r.json()
        ticket = body["by_status"]["In Progress"][0]
        assert ticket["epic_key"] == "FM-100"
        assert ticket["component_name"] == "Mobile"


class TestPinsRoutes:

    def test_pins_crud(self, live_client):
        # empty
        assert live_client.get("/live/pins").json() == []

        # upsert
        r = live_client.put(
            "/live/pins/FM-1",
            json={"board_id": None, "ticket_snapshot": {"key": "FM-1"}},
        )
        assert r.status_code == 200
        assert r.json()["ticket_key"] == "FM-1"

        listed = live_client.get("/live/pins").json()
        assert len(listed) == 1
        assert listed[0]["ticket_snapshot"] == {"key": "FM-1"}

        # delete
        r = live_client.delete("/live/pins/FM-1")
        assert r.status_code == 200
        assert r.json() == {"deleted": True}
        assert live_client.get("/live/pins").json() == []

    def test_pins_400_on_empty_key(self, live_client):
        r = live_client.put(
            "/live/pins/   ", json={"board_id": None, "ticket_snapshot": None}
        )
        assert r.status_code == 400


class TestGeneratedCasesRoutes:

    def test_crud_generated_cases(self, live_client):
        # create
        r = live_client.post(
            "/live/generated-cases",
            json={
                "ticket_key": "FM-1",
                "instructions": "x",
                "cases": [{"name": "smoke"}],
            },
        )
        assert r.status_code == 201
        created = r.json()
        cid = created["id"]
        assert created["instructions"] == "x"
        assert created["cases"][0]["name"] == "smoke"

        # list
        listed = live_client.get("/live/generated-cases").json()
        assert any(row["id"] == cid for row in listed)

        # list filtered by ticket
        scoped = live_client.get(
            "/live/generated-cases", params={"ticket_key": "FM-1"}
        ).json()
        assert {row["ticket_key"] for row in scoped} == {"FM-1"}

        # patch
        patched = live_client.patch(
            f"/live/generated-cases/{cid}",
            json={"status": "exported", "exported_at": "2026-05-16T00:00:00Z"},
        ).json()
        assert patched["status"] == "exported"
        assert patched["exported_at"] == "2026-05-16T00:00:00Z"

        # delete
        assert live_client.delete(
            f"/live/generated-cases/{cid}"
        ).json() == {"deleted": True}
        assert (
            live_client.patch(
                f"/live/generated-cases/{cid}", json={"instructions": "?"}
            ).status_code
            == 404
        )

    def test_delete_unknown_404(self, live_client):
        r = live_client.delete("/live/generated-cases/missing")
        assert r.status_code == 404


# Publish-to-Jira route is exercised in `test_live_publish_routes.py`
# (Phase 06b). The Phase 01 501 stub no longer exists.


class TestActivityRoutes:

    def test_activity_crud(self, live_client):
        # empty
        assert live_client.get("/live/activity").json() == []

        # create
        r = live_client.post(
            "/live/activity",
            json={
                "board_id": None,
                "ticket_key": "FM-1",
                "kind": "ticket_pinned",
                "summary": "pinned FM-1",
                "detail": "from drawer",
            },
        )
        assert r.status_code == 201
        row = r.json()
        assert row["kind"] == "ticket_pinned"

        # list
        listed = live_client.get("/live/activity").json()
        assert len(listed) == 1

        # board scope
        r = live_client.post(
            "/live/activity",
            json={
                "board_id": "B",
                "kind": "board_created",
                "summary": "created",
                "detail": "",
            },
        )
        assert r.status_code == 201
        scoped = live_client.get(
            "/live/activity", params={"board_id": "B"}
        ).json()
        assert len(scoped) == 1
        assert scoped[0]["board_id"] == "B"

        # clear board-scoped
        clear = live_client.delete("/live/activity", params={"board_id": "B"})
        assert clear.json() == {"deleted": 1}

        # clear all
        clear = live_client.delete("/live/activity")
        assert clear.json()["deleted"] >= 1
        assert live_client.get("/live/activity").json() == []
class TestLiveGenerateEnrichment:
    """Phase 20: re-fetch enriched ticket by key before routing."""

    def test_routed_path_refetches_ticket(self, live_client, monkeypatch):
        import services.ai_service as ai
        import services.jira_service as jira_svc
        import services.context_orchestrator as orch

        seen_for_routing: dict = {}

        async def fake_get_by_keys(keys):
            assert keys == ["FM-1"]
            return [
                {
                    "key": "FM-1",
                    "id": "10001",
                    "summary": "Enriched",
                    "development_links": ["https://github.com/o/r/pull/9"],
                    "pull_requests": [
                        {
                            "id": "github:o/r:9",
                            "provider": "github",
                            "url": "https://github.com/o/r/pull/9",
                            "title": "Enriched PR",
                            "state": "open",
                            "repository": "o/r",
                            "number": 9,
                            "updated_at": None,
                            "source": "jira_dev_status",
                        }
                    ],
                    "development_links_error": "",
                    "development_links_diagnostics": {
                        "source": "jira_dev_status",
                        "issue_id": "10001",
                        "issue_key": "FM-1",
                        "probes": [
                            {
                                "provider_hint": "github",
                                "application_type": "GitHub",
                                "status": 200,
                                "ok": True,
                                "pull_request_count": 1,
                                "duration_ms": 5,
                                "error": "",
                            }
                        ],
                        "selected_pull_request_count": 1,
                        "selected_link_count": 1,
                        "error": "",
                    },
                }
            ]

        async def fake_build_for_ticket(ticket, **_):
            seen_for_routing["ticket"] = ticket
            # Return a minimal-but-valid bundle.
            from schemas.context_bundle_models import (
                BudgetStats,
                ContextBundle,
                RoutingDecision,
                TicketContext,
                ToolTrace,
            )
            return ContextBundle(
                ticket=TicketContext(
                    key=ticket.get("key", ""),
                    summary=ticket.get("summary", ""),
                    development_links=list(ticket.get("development_links") or []),
                ),
                tool_trace=ToolTrace(
                    routing_decisions=[
                        RoutingDecision(
                            provider="github",
                            included=True,
                            reasons=["pr_link_present"],
                        )
                    ],
                ),
                budget=BudgetStats(hard_cap_chars=1000),
            )

        async def fake_from_bundle(bundle, instructions):
            return {"test_cases": [{"name": "ok"}]}

        monkeypatch.setattr(jira_svc, "get_tickets_by_keys", fake_get_by_keys)
        monkeypatch.setattr(orch, "build_for_ticket", fake_build_for_ticket)
        monkeypatch.setattr(ai, "generate_test_cases_from_bundle", fake_from_bundle)

        r = live_client.post(
            "/live/generate",
            json={"ticket": {"key": "FM-1", "summary": "stale board card"}},
        )
        assert r.status_code == 200
        # The orchestrator must have received the enriched ticket, not the stale one.
        assert seen_for_routing["ticket"]["summary"] == "Enriched"
        assert seen_for_routing["ticket"]["development_links"] == [
            "https://github.com/o/r/pull/9"
        ]

        body = r.json()
        # Diagnostics surfaced in context_metadata.
        diag = body["context_metadata"]["development_links_diagnostics"]
        assert diag["selected_pull_request_count"] == 1
        assert diag["probes"][0]["application_type"] == "GitHub"

    def test_enrichment_failure_falls_back_with_warning(self, live_client, monkeypatch):
        import services.ai_service as ai
        import services.jira_service as jira_svc
        import services.context_orchestrator as orch

        async def fake_get_by_keys(keys):
            raise RuntimeError("jira down")

        async def fake_build_for_ticket(ticket, **_):
            from schemas.context_bundle_models import (
                BudgetStats,
                ContextBundle,
                TicketContext,
                ToolTrace,
            )
            return ContextBundle(
                ticket=TicketContext(key=ticket.get("key", "")),
                tool_trace=ToolTrace(),
                budget=BudgetStats(hard_cap_chars=1000),
            )

        async def fake_from_bundle(bundle, instructions):
            return {"test_cases": []}

        monkeypatch.setattr(jira_svc, "get_tickets_by_keys", fake_get_by_keys)
        monkeypatch.setattr(orch, "build_for_ticket", fake_build_for_ticket)
        monkeypatch.setattr(ai, "generate_test_cases_from_bundle", fake_from_bundle)

        r = live_client.post(
            "/live/generate",
            json={"ticket": {"key": "FM-7", "summary": "card"}},
        )
        assert r.status_code == 200
        errors = r.json()["context_metadata"]["errors"]
        codes = {e.get("code") for e in errors}
        assert "ticket_enrichment_failed" in codes

    def test_no_development_links_recorded_as_warning(self, live_client, monkeypatch):
        import services.ai_service as ai
        import services.jira_service as jira_svc
        import services.context_orchestrator as orch

        async def fake_get_by_keys(keys):
            return [
                {
                    "key": "FM-2",
                    "id": "10002",
                    "summary": "Plain",
                    "development_links": [],
                    "pull_requests": [],
                    "development_links_error": "",
                }
            ]

        async def fake_build_for_ticket(ticket, **_):
            from schemas.context_bundle_models import (
                BudgetStats,
                ContextBundle,
                TicketContext,
                ToolTrace,
            )
            return ContextBundle(
                ticket=TicketContext(key=ticket.get("key", "")),
                tool_trace=ToolTrace(),
                budget=BudgetStats(hard_cap_chars=1000),
            )

        async def fake_from_bundle(bundle, instructions):
            return {"test_cases": []}

        monkeypatch.setattr(jira_svc, "get_tickets_by_keys", fake_get_by_keys)
        monkeypatch.setattr(orch, "build_for_ticket", fake_build_for_ticket)
        monkeypatch.setattr(ai, "generate_test_cases_from_bundle", fake_from_bundle)

        r = live_client.post(
            "/live/generate",
            json={"ticket": {"key": "FM-2"}},
        )
        assert r.status_code == 200
        codes = {e.get("code") for e in r.json()["context_metadata"]["errors"]}
        assert "no_development_links" in codes
