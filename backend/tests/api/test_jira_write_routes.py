import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def jira_client(fake_keyring):
    from api.jira_routes import router
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class TestBoardEndpoint:

    def test_400_on_empty_jql(self, jira_client):
        r = jira_client.get("/jira/board?jql=")
        assert r.status_code == 400

    def test_proxies_to_service(self, jira_client, monkeypatch):
        import services.jira_service as svc

        async def fake_board(jql, fields=None):
            assert jql == "project = FM"
            return {
                "total": 1,
                "by_status": {"To Do": [{"key": "FM-1"}]},
                "fetched_at": "2026-01-01T00:00:00Z",
            }

        monkeypatch.setattr(svc, "get_board", fake_board)
        r = jira_client.get("/jira/board", params={"jql": "project = FM"})
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 1
        assert "To Do" in body["by_status"]

    def test_502_on_jira_failure(self, jira_client, monkeypatch):
        import services.jira_service as svc

        async def fake_board(jql, fields=None):
            raise RuntimeError("network")

        monkeypatch.setattr(svc, "get_board", fake_board)
        r = jira_client.get("/jira/board", params={"jql": "x"})
        assert r.status_code == 502


class TestPostComment:

    def test_strips_body_from_response(self, jira_client, monkeypatch):
        import services.jira_service as svc

        async def fake_post(ticket_key, body):
            return {"id": "1", "author": "Tester", "created": "2026-01-01"}

        monkeypatch.setattr(svc, "post_comment", fake_post)
        r = jira_client.post("/jira/tickets/FM-1/comments", json={"body": "ok"})
        assert r.status_code == 200
        body = r.json()
        assert "body" not in body["comment"]
        assert body["secret_scan_warnings"] == []

    def test_secret_warning_no_preview(self, jira_client, monkeypatch):
        import services.jira_service as svc

        async def fake_post(ticket_key, body):
            return {"id": "1", "author": "Tester", "created": "2026-01-01"}

        monkeypatch.setattr(svc, "post_comment", fake_post)
        leaky = "credentials: AccountKey=" + "X" * 86 + "=="
        r = jira_client.post(
            "/jira/tickets/FM-1/comments", json={"body": leaky}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["secret_scan_warnings"]
        for w in body["secret_scan_warnings"]:
            assert set(w.keys()) == {"pattern_name"}
        raw = r.text
        assert "AccountKey=XXXX" not in raw
        assert "match_preview" not in raw
        assert "body" not in body["comment"]

    def test_empty_body_is_422(self, jira_client):
        r = jira_client.post("/jira/tickets/FM-1/comments", json={"body": ""})
        assert r.status_code == 422


class TestTransitions:

    def test_skipped_when_already_in_target(self, jira_client, monkeypatch):
        import services.jira_service as svc

        async def fake_transitions(key):
            return [
                {"id": "31", "name": "Done", "to": {"id": "10", "name": "Done"}}
            ]

        async def fake_status(key):
            return "Done"

        async def fake_do(key, tid):
            raise AssertionError("should not be called")

        monkeypatch.setattr(svc, "get_transitions", fake_transitions)
        monkeypatch.setattr(svc, "get_status", fake_status)
        monkeypatch.setattr(svc, "do_transition", fake_do)
        r = jira_client.post(
            "/jira/tickets/FM-1/transitions", json={"transitionId": "31"}
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True, "skipped": True}

    def test_400_on_unknown_id(self, jira_client, monkeypatch):
        import services.jira_service as svc

        async def fake_transitions(key):
            return [
                {"id": "31", "name": "Done", "to": {"id": "10", "name": "Done"}}
            ]

        monkeypatch.setattr(svc, "get_transitions", fake_transitions)
        r = jira_client.post(
            "/jira/tickets/FM-1/transitions", json={"transitionId": "999"}
        )
        assert r.status_code == 400

    def test_runs_when_not_skipped(self, jira_client, monkeypatch):
        import services.jira_service as svc

        called = {}

        async def fake_transitions(key):
            return [
                {"id": "31", "name": "Done", "to": {"id": "10", "name": "Done"}}
            ]

        async def fake_status(key):
            return "In Progress"

        async def fake_do(key, tid):
            called["yes"] = (key, tid)

        monkeypatch.setattr(svc, "get_transitions", fake_transitions)
        monkeypatch.setattr(svc, "get_status", fake_status)
        monkeypatch.setattr(svc, "do_transition", fake_do)
        r = jira_client.post(
            "/jira/tickets/FM-1/transitions", json={"transitionId": "31"}
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True, "skipped": False}
        assert called.get("yes") == ("FM-1", "31")

    def test_get_transitions(self, jira_client, monkeypatch):
        import services.jira_service as svc

        async def fake_transitions(key):
            return [
                {
                    "id": "31",
                    "name": "Done",
                    "to": {"id": "10", "name": "Done"},
                }
            ]

        monkeypatch.setattr(svc, "get_transitions", fake_transitions)
        r = jira_client.get("/jira/tickets/FM-1/transitions")
        assert r.status_code == 200
        assert r.json()[0]["name"] == "Done"
