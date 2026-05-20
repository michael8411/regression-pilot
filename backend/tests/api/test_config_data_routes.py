import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "config_data_routes_test.db"


@pytest.fixture
def client(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    from api.config_routes import router as config_router
    from api.cycle_routes import router as cycle_router

    app = FastAPI()
    app.include_router(config_router)
    app.include_router(cycle_router)
    return TestClient(app)


class TestExport:

    def test_export_ok(self, client):
        r = client.post("/config/data/export")
        assert r.status_code == 200
        body = r.json()
        assert body["version"] == 1
        assert "exported_at" in body
        assert "tables" in body
        assert "config" in body

    def test_export_excludes_token_keys(self, client):
        from utils import keyring_store

        keyring_store.set_credential("jira_api_token", "secret-jira-token")
        keyring_store.set_credential("gemini_api_key", "secret-gemini-key")
        keyring_store.set_credential("zephyr_api_token", "secret-zephyr-token")

        r = client.post("/config/data/export")
        assert r.status_code == 200
        raw = r.text
        # Tokens never appear as either keys or values.
        assert "jira_api_token" not in raw
        assert "gemini_api_key" not in raw
        assert "zephyr_api_token" not in raw
        assert "secret-jira-token" not in raw
        assert "secret-gemini-key" not in raw
        assert "secret-zephyr-token" not in raw


class TestWipe:

    def test_wipe_requires_explicit_confirmation(self, client):
        r = client.post(
            "/config/data/wipe", json={"confirmation": "yes", "keepCredentials": True}
        )
        assert r.status_code == 422

    def test_wipe_rejects_lowercase_confirmation_implicitly(self, client):
        # Lowercase is uppercased then compared — accepted.
        r = client.post(
            "/config/data/wipe",
            json={"confirmation": "wipe", "keepCredentials": True},
        )
        assert r.status_code == 200

    def test_wipe_keeps_credentials_when_requested(self, client):
        from utils import keyring_store

        keyring_store.set_credential("jira_api_token", "k")
        # Insert a cycle row.
        client.post(
            "/cycles",
            json={
                "name": "ToWipe",
                "projectKey": "FM",
                "ticketKeys": ["FM-1"],
            },
        )

        r = client.post(
            "/config/data/wipe",
            json={"confirmation": "WIPE", "keepCredentials": True},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["credentials_cleared"] == 0

        # Cycles list empty.
        listed = client.get("/cycles").json()
        assert listed == []
        # Credential still here.
        assert keyring_store.get_credential("jira_api_token") == "k"

    def test_wipe_clears_credentials_when_requested(self, client):
        from utils import keyring_store

        keyring_store.set_credential("jira_api_token", "k1")
        keyring_store.set_credential("gemini_api_key", "k2")

        r = client.post(
            "/config/data/wipe",
            json={"confirmation": "WIPE", "keepCredentials": False},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["credentials_cleared"] >= 2

        assert keyring_store.get_credential("jira_api_token") is None
        assert keyring_store.get_credential("gemini_api_key") is None
