import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "sessions_test.db"


@pytest.fixture
def session_client(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    from api.session_routes import router
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _create(client, project_key="FM", version_name="1.0.0"):
    return client.post("/sessions", json={"project_key": project_key, "version_name": version_name})


class TestGetActive:

    def test_404_when_no_session(self, session_client):
        resp = session_client.get("/sessions/active")
        assert resp.status_code == 404
        assert "active session" in resp.json()["detail"].lower()

    def test_200_after_create(self, session_client):
        _create(session_client)
        resp = session_client.get("/sessions/active")
        assert resp.status_code == 200
        body = resp.json()
        assert body["project_key"] == "FM"
        assert body["is_active"] == 1
        assert isinstance(body["state"], dict)

    def test_active_not_matched_as_session_id(self, session_client):
        # /sessions/active must be handled before /{session_id}
        resp = session_client.get("/sessions/active")
        assert resp.status_code == 404
        assert "active session" in resp.json()["detail"].lower()


class TestCreateSession:

    def test_returns_200_with_id(self, session_client):
        resp = _create(session_client)
        assert resp.status_code == 200
        body = resp.json()
        assert "id" in body
        assert body["project_key"] == "FM"
        assert body["version_name"] == "1.0.0"
        assert body["status"] == "in_progress"
        assert body["state"] == {}

    def test_missing_project_key_is_422(self, session_client):
        resp = session_client.post("/sessions", json={"version_name": "1.0"})
        assert resp.status_code == 422

    def test_empty_body_is_422(self, session_client):
        resp = session_client.post("/sessions", json={})
        assert resp.status_code == 422

    def test_only_one_active_at_a_time(self, session_client):
        _create(session_client, project_key="A")
        _create(session_client, project_key="B")
        active = session_client.get("/sessions/active").json()
        assert active["project_key"] == "B"

    def test_new_session_has_empty_state(self, session_client):
        body = _create(session_client).json()
        assert body["state"] == {}


class TestListSessions:

    def test_empty_list_when_none(self, session_client):
        resp = session_client.get("/sessions")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_list_after_create(self, session_client):
        _create(session_client)
        resp = session_client.get("/sessions")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_limit_param_is_respected(self, session_client):
        for i in range(5):
            _create(session_client, project_key=f"P{i}")
        resp = session_client.get("/sessions?limit=3")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_metadata_only_no_state_field(self, session_client):
        _create(session_client)
        item = session_client.get("/sessions").json()[0]
        assert "id" in item
        assert "project_key" in item
        assert "state" not in item

    def test_ordered_most_recent_first(self, session_client):
        _create(session_client, project_key="first")
        _create(session_client, project_key="second")
        sessions = session_client.get("/sessions").json()
        assert sessions[0]["project_key"] == "second"


class TestGetSessionById:

    def test_200_for_existing_session(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.get(f"/sessions/{sid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == sid

    def test_404_for_nonexistent_id(self, session_client):
        resp = session_client.get("/sessions/does-not-exist")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_returns_correct_fields(self, session_client):
        sid = _create(session_client, project_key="XY", version_name="2.0").json()["id"]
        body = session_client.get(f"/sessions/{sid}").json()
        assert body["project_key"] == "XY"
        assert body["version_name"] == "2.0"


class TestSaveStateSingle:

    def test_returns_saved_true(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(
            f"/sessions/{sid}/state",
            json={"key": "currentView", "value": "generate"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["saved"] is True
        assert "secret_scan_warnings" in body
        assert body["secret_scan_warnings"] == []

    def test_falsy_zero_value_is_accepted(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(f"/sessions/{sid}/state", json={"key": "count", "value": 0})
        assert resp.status_code == 200
        assert resp.json()["saved"] is True

    def test_falsy_false_value_is_accepted(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(f"/sessions/{sid}/state", json={"key": "flag", "value": False})
        assert resp.status_code == 200

    def test_falsy_empty_list_value_is_accepted(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(f"/sessions/{sid}/state", json={"key": "items", "value": []})
        assert resp.status_code == 200

    def test_key_without_value_is_400(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(f"/sessions/{sid}/state", json={"key": "orphan"})
        assert resp.status_code == 400

    def test_value_without_key_is_400(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(f"/sessions/{sid}/state", json={"value": "orphan"})
        assert resp.status_code == 400

    def test_empty_body_is_400(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(f"/sessions/{sid}/state", json={})
        assert resp.status_code == 400


class TestSaveStateBatch:

    def test_batch_returns_saved_true(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(
            f"/sessions/{sid}/state",
            json={"items": {"testCases": [{"name": "t1"}], "instructions": "mobile"}},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["saved"] is True
        assert body["secret_scan_warnings"] == []

    def test_empty_batch_is_accepted(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(f"/sessions/{sid}/state", json={"items": {}})
        assert resp.status_code == 200
        assert resp.json()["saved"] is True

    def test_batch_and_single_together_is_400(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(
            f"/sessions/{sid}/state",
            json={"key": "k", "value": "v", "items": {"k": "v"}},
        )
        assert resp.status_code == 400

    def test_items_with_key_is_400(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.put(
            f"/sessions/{sid}/state",
            json={"items": {"k": "v"}, "key": "k"},
        )
        assert resp.status_code == 400


class TestStateRoundTrip:

    def test_single_key_readable_via_active(self, session_client):
        sid = _create(session_client).json()["id"]
        session_client.put(f"/sessions/{sid}/state", json={"key": "currentView", "value": "review"})
        active = session_client.get("/sessions/active").json()
        assert active["state"]["currentView"] == "review"

    def test_batch_keys_all_readable(self, session_client):
        sid = _create(session_client).json()["id"]
        session_client.put(
            f"/sessions/{sid}/state",
            json={"items": {"testCases": [{"name": "t1"}], "instructions": "mobile"}},
        )
        state = session_client.get("/sessions/active").json()["state"]
        assert state["testCases"] == [{"name": "t1"}]
        assert state["instructions"] == "mobile"

    def test_upsert_overwrites_previous_value(self, session_client):
        sid = _create(session_client).json()["id"]
        session_client.put(f"/sessions/{sid}/state", json={"key": "view", "value": "a"})
        session_client.put(f"/sessions/{sid}/state", json={"key": "view", "value": "b"})
        state = session_client.get("/sessions/active").json()["state"]
        assert state["view"] == "b"

    def test_nested_structure_round_trips(self, session_client):
        sid = _create(session_client).json()["id"]
        payload = {"steps": [1, 2, 3], "meta": {"deep": True}}
        session_client.put(f"/sessions/{sid}/state", json={"key": "data", "value": payload})
        state = session_client.get("/sessions/active").json()["state"]
        assert state["data"] == payload

    def test_falsy_values_round_trip_correctly(self, session_client):
        sid = _create(session_client).json()["id"]
        session_client.put(f"/sessions/{sid}/state", json={"key": "count", "value": 0})
        state = session_client.get("/sessions/active").json()["state"]
        assert state["count"] == 0


class TestActivateSession:

    def test_activate_switches_active_session(self, session_client):
        sid1 = _create(session_client, project_key="A").json()["id"]
        _create(session_client, project_key="B")
        # B is now active; reactivate A
        resp = session_client.post(f"/sessions/{sid1}/activate")
        assert resp.status_code == 200
        assert resp.json()["id"] == sid1
        assert resp.json()["is_active"] == 1

    def test_only_one_active_after_activate(self, session_client):
        sid1 = _create(session_client, project_key="A").json()["id"]
        _create(session_client, project_key="B")
        session_client.post(f"/sessions/{sid1}/activate")
        active = session_client.get("/sessions/active").json()
        assert active["id"] == sid1

    def test_activate_preserves_state(self, session_client):
        sid1 = _create(session_client, project_key="A").json()["id"]
        session_client.put(f"/sessions/{sid1}/state", json={"key": "view", "value": "done"})
        _create(session_client, project_key="B")
        session_client.post(f"/sessions/{sid1}/activate")
        state = session_client.get("/sessions/active").json()["state"]
        assert state["view"] == "done"

    def test_activate_nonexistent_is_404(self, session_client):
        resp = session_client.post("/sessions/nonexistent-id/activate")
        assert resp.status_code == 404


class TestDeleteSession:

    def test_delete_returns_deleted_true(self, session_client):
        sid = _create(session_client).json()["id"]
        resp = session_client.delete(f"/sessions/{sid}")
        assert resp.status_code == 200
        assert resp.json() == {"deleted": True}

    def test_active_is_404_after_delete(self, session_client):
        sid = _create(session_client).json()["id"]
        session_client.delete(f"/sessions/{sid}")
        assert session_client.get("/sessions/active").status_code == 404

    def test_get_by_id_is_404_after_delete(self, session_client):
        sid = _create(session_client).json()["id"]
        session_client.delete(f"/sessions/{sid}")
        assert session_client.get(f"/sessions/{sid}").status_code == 404

    def test_not_in_list_after_delete(self, session_client):
        sid = _create(session_client).json()["id"]
        session_client.delete(f"/sessions/{sid}")
        ids = [s["id"] for s in session_client.get("/sessions").json()]
        assert sid not in ids


class TestErrorSanitization:

    def test_read_error_returns_fixed_string_no_leak(self, session_client, monkeypatch):
        import services.session_service as svc

        async def _fail():
            raise RuntimeError("internal ciphertext detail xyzSECRET")

        monkeypatch.setattr(svc, "get_active_session", _fail)
        _create(session_client)
        resp = session_client.get("/sessions/active")
        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert detail == "Failed to read session data"
        assert "xyzSECRET" not in detail
        assert "ciphertext" not in detail

    def test_write_error_returns_fixed_string_no_leak(self, session_client, monkeypatch):
        import services.session_service as svc

        async def _fail(*a, **kw):
            raise RuntimeError("internal secret bytes abcSECRET")

        sid = _create(session_client).json()["id"]
        monkeypatch.setattr(svc, "save_state", _fail)
        resp = session_client.put(
            f"/sessions/{sid}/state",
            json={"key": "k", "value": "v"},
        )
        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert detail == "Failed to save session data"
        assert "abcSECRET" not in detail

    def test_list_error_returns_fixed_string(self, session_client, monkeypatch):
        import services.session_service as svc

        async def _fail(*a, **kw):
            raise RuntimeError("db error leak")

        monkeypatch.setattr(svc, "list_sessions", _fail)
        resp = session_client.get("/sessions")
        assert resp.status_code == 500
        assert resp.json()["detail"] == "Failed to read session data"
        assert "db error leak" not in resp.json()["detail"]

    def test_400_detail_not_suppressed(self, session_client):
        # 400 (validation we raise) should still have a meaningful detail
        sid = _create(session_client).json()["id"]
        resp = session_client.put(f"/sessions/{sid}/state", json={})
        assert resp.status_code == 400
        assert resp.json()["detail"] != "Failed to save session data"
