import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "cycles_routes_test.db"


@pytest.fixture
def cycle_client(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    from api.cycle_routes import router as cycle_router
    from api.session_routes import router as session_router

    app = FastAPI()
    app.include_router(cycle_router)
    app.include_router(session_router)
    return TestClient(app)


def _payload(**overrides):
    body = {
        "name": "Smoke FM",
        "description": "smoke",
        "projectKey": "FM",
        "versionHint": "24.1",
        "ticketKeys": ["FM-1", "FM-2"],
        "themes": [
            {"id": "t1", "label": "UI", "ticketKeys": ["FM-1"]},
        ],
        "testCaseRefs": [],
        "pinned": False,
    }
    body.update(overrides)
    return body


class TestCRUD:

    def test_create_then_list(self, cycle_client):
        r = cycle_client.post("/cycles", json=_payload())
        assert r.status_code == 200
        cid = r.json()["id"]

        listed = cycle_client.get("/cycles").json()
        assert any(c["id"] == cid for c in listed)
        # Summary shape: no description / themes / ticketKeys.
        item = next(c for c in listed if c["id"] == cid)
        assert "description" not in item
        assert "themes" not in item
        assert item["ticketCount"] == 2
        assert item["themeCount"] == 1

    def test_get_full_cycle(self, cycle_client):
        cid = cycle_client.post("/cycles", json=_payload()).json()["id"]
        full = cycle_client.get(f"/cycles/{cid}").json()
        assert full["description"] == "smoke"
        assert full["ticketKeys"] == ["FM-1", "FM-2"]
        assert full["themes"][0]["label"] == "UI"

    def test_get_404(self, cycle_client):
        r = cycle_client.get("/cycles/does-not-exist")
        assert r.status_code == 404

    def test_patch_partial(self, cycle_client):
        cid = cycle_client.post("/cycles", json=_payload()).json()["id"]
        r = cycle_client.patch(f"/cycles/{cid}", json={"name": "Renamed"})
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed"

    def test_patch_404(self, cycle_client):
        r = cycle_client.patch(
            "/cycles/does-not-exist", json={"name": "x"}
        )
        assert r.status_code == 404

    def test_delete_then_404(self, cycle_client):
        cid = cycle_client.post("/cycles", json=_payload()).json()["id"]
        assert cycle_client.delete(f"/cycles/{cid}").status_code == 200
        assert cycle_client.delete(f"/cycles/{cid}").status_code == 404

    def test_archive_hidden_from_default_list(self, cycle_client):
        cid = cycle_client.post("/cycles", json=_payload()).json()["id"]
        cycle_client.patch(f"/cycles/{cid}", json={"archived": True})
        ids = [c["id"] for c in cycle_client.get("/cycles").json()]
        assert cid not in ids
        ids = [
            c["id"]
            for c in cycle_client.get(
                "/cycles?includeArchived=true"
            ).json()
        ]
        assert cid in ids

    def test_too_many_keys_returns_422(self, cycle_client):
        body = _payload(ticketKeys=[f"FM-{i}" for i in range(501)])
        r = cycle_client.post("/cycles", json=body)
        assert r.status_code == 422


class TestDuplicate:

    def test_duplicate_creates_copy(self, cycle_client):
        cid = cycle_client.post("/cycles", json=_payload()).json()["id"]
        r = cycle_client.post(f"/cycles/{cid}/duplicate")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] != cid
        assert body["name"].endswith("(copy)")
        assert body["pinned"] is False
        assert body["runCount"] == 0

    def test_duplicate_404(self, cycle_client):
        r = cycle_client.post("/cycles/does-not-exist/duplicate")
        assert r.status_code == 404


class TestRun:

    def test_run_creates_session_and_hydrates(self, cycle_client):
        cid = cycle_client.post("/cycles", json=_payload()).json()["id"]
        r = cycle_client.post(
            f"/cycles/{cid}/run", json={"sessionName": "FM-via-cycle"}
        )
        assert r.status_code == 200
        run = r.json()
        assert run["sessionId"]
        assert run["status"] == "session_created"

        sid = run["sessionId"]
        # State is reachable via the session route and contains hydrated keys.
        s = cycle_client.get(f"/sessions/{sid}").json()
        assert s["id"] == sid

        # Cycle counters bump.
        full = cycle_client.get(f"/cycles/{cid}").json()
        assert full["runCount"] == 1
        assert full["lastRunAt"]

    def test_runs_log_returns_newest_first(self, cycle_client):
        cid = cycle_client.post("/cycles", json=_payload()).json()["id"]
        r1 = cycle_client.post(f"/cycles/{cid}/run", json={}).json()
        r2 = cycle_client.post(f"/cycles/{cid}/run", json={}).json()
        runs = cycle_client.get(f"/cycles/{cid}/runs").json()
        assert [r["id"] for r in runs[:2]] == [r2["id"], r1["id"]]

    def test_run_404(self, cycle_client):
        r = cycle_client.post("/cycles/does-not-exist/run", json={})
        assert r.status_code == 404

    def test_patch_run_status(self, cycle_client):
        cid = cycle_client.post("/cycles", json=_payload()).json()["id"]
        rid = (
            cycle_client.post(f"/cycles/{cid}/run", json={}).json()["id"]
        )
        r = cycle_client.patch(
            f"/cycles/{cid}/runs/{rid}",
            json={"status": "completed", "notes": "done"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "completed"
        assert r.json()["notes"] == "done"

    def test_patch_run_404(self, cycle_client):
        cid = cycle_client.post("/cycles", json=_payload()).json()["id"]
        r = cycle_client.patch(
            f"/cycles/{cid}/runs/nope", json={"status": "failed"}
        )
        assert r.status_code == 404
