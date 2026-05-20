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
        import services.ai_service as ai

        async def fake_generate(tickets, instructions):
            assert len(tickets) == 1
            assert tickets[0]["key"] == "FM-1"
            return {"test_cases": [{"name": "smoke"}]}

        monkeypatch.setattr(ai, "generate_test_cases", fake_generate)
        r = live_client.post(
            "/live/generate",
            json={"ticket": {"key": "FM-1", "summary": "x"}},
        )
        assert r.status_code == 200
        assert r.json()["test_cases"][0]["name"] == "smoke"

    def test_502_on_ai_failure(self, live_client, monkeypatch):
        import services.ai_service as ai

        async def fake_generate(tickets, instructions):
            raise RuntimeError("model down")

        monkeypatch.setattr(ai, "generate_test_cases", fake_generate)
        r = live_client.post(
            "/live/generate", json={"ticket": {"key": "FM-1"}}
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
