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


class TestPublishStub:
    """Phase 06b is not yet shipped — the route must reserve the URL and
    return 501 so the UI degrades to the comment-fallback path safely.

    When Phase 06b lands, replace this with the success-path coverage in
    `test_live_publish_routes.py`."""

    def test_publish_returns_501(self, live_client):
        r = live_client.post("/live/generated-cases/anything/publish")
        assert r.status_code == 501
        assert "Phase 06b" in r.json().get("detail", "")


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
