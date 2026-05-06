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
