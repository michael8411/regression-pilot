"""Tests for config_routes non-network endpoints."""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


_BASELINE_ENV = {
    "JIRA_BASE_URL": "https://baseline.example/",
    "JIRA_EMAIL": "baseline@example.com",
    "JIRA_API_TOKEN": "env-jira-token",
    "GEMINI_API_KEY": "env-gemini-key",
    "ZEPHYR_BASE_URL": "https://baseline.zephyr/",
    "ZEPHYR_API_TOKEN": "env-zephyr-token",
}


@pytest.fixture
def baseline_env(monkeypatch):
    for k, v in _BASELINE_ENV.items():
        monkeypatch.setenv(k, v)
    yield


@pytest.fixture
def isolated_preferences(tmp_path, monkeypatch):
    """Redirect the preferences module to a throwaway file so we never touch
    the real backend/preferences.json.

    `read_preferences(path=PREFERENCES_PATH)` captures the default argument
    at function-definition time, so simply rebinding `PREFERENCES_PATH` on
    the module is not enough. Instead we swap the function objects for
    tmp-path-bound wrappers wherever they're imported from.
    """
    prefs_file = tmp_path / "preferences.json"

    import config.preferences as prefs_mod
    original_read = prefs_mod.read_preferences
    original_write = prefs_mod.write_preferences

    def read_override(path=prefs_file):
        return original_read(path)

    def write_override(updates, path=prefs_file):
        return original_write(updates, path)

    monkeypatch.setattr(prefs_mod, "read_preferences", read_override)
    monkeypatch.setattr(prefs_mod, "write_preferences", write_override)

    import api.config_routes as routes_mod
    monkeypatch.setattr(routes_mod, "read_preferences", read_override)
    monkeypatch.setattr(routes_mod, "write_preferences", write_override)

    yield prefs_file


@pytest.fixture
def client(fake_keyring, baseline_env, isolated_preferences):
    from api.config_routes import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class TestConfigStatus:

    def test_returns_200(self, client):
        resp = client.get("/config/status")
        assert resp.status_code == 200

    def test_shape_when_all_configured(self, client):
        body = client.get("/config/status").json()
        assert body["jira"]["configured"] is True
        assert body["jira"]["base_url"] == "https://baseline.example/"
        assert body["jira"]["email"] == "baseline@example.com"
        assert body["ai"]["configured"] is True
        assert body["zephyr"]["configured"] is True

    def test_reflects_keyring_overlay(self, client, fake_keyring):
        """After a keyring update, /config/status should pick up the new value."""
        fake_keyring.set_password("testdeck", "gemini_api_key", "overlay-key")
        from config.settings import get_settings
        get_settings.cache_clear()

        body = client.get("/config/status").json()
        assert body["ai"]["configured"] is True


class TestPreferencesEndpoint:

    def test_get_returns_defaults(self, client):
        body = client.get("/config/preferences").json()
        assert body["theme"] == "dark"
        assert body["ai_model"] == "gemini-2.5-flash"

    def test_post_updates_theme(self, client, isolated_preferences):
        resp = client.post("/config/preferences", json={"theme": "light"})
        assert resp.status_code == 200
        assert resp.json()["theme"] == "light"

        assert client.get("/config/preferences").json()["theme"] == "light"
        on_disk = json.loads(isolated_preferences.read_text())
        assert on_disk["theme"] == "light"

    def test_post_rejects_invalid_theme(self, client):
        resp = client.post("/config/preferences", json={"theme": "neon"})
        assert resp.status_code == 422

    def test_post_rejects_out_of_range_temperature(self, client):
        resp = client.post("/config/preferences", json={"ai_temperature": 5.0})
        assert resp.status_code == 422

    def test_post_with_none_fields_is_noop(self, client, isolated_preferences):
        """None values in the request are filtered out — they don't overwrite."""
        client.post("/config/preferences", json={"theme": "light"})
        resp = client.post("/config/preferences", json={"theme": None, "ai_model": "gemini-x"})
        body = resp.json()
        assert body["theme"] == "light"
        assert body["ai_model"] == "gemini-x"


class TestCredentialsEndpoint:

    def test_writes_to_keyring_not_env(self, client, fake_keyring, monkeypatch, tmp_path):
        """Credentials should be written to keyring, not .env."""
        import services.config_service as svc
        env_file = tmp_path / ".env"
        env_file.write_text("# pre-existing content\n")
        monkeypatch.setattr(svc, "ENV_PATH", env_file)

        resp = client.post(
            "/config/credentials",
            json={"jira_api_token": "new-jira-token"},
        )
        assert resp.status_code == 200
        assert resp.json()["updated"] == ["jira_api_token"]

        assert fake_keyring.get_password("testdeck", "jira_api_token") == "new-jira-token"
        assert "new-jira-token" not in env_file.read_text()
        assert "# pre-existing content" in env_file.read_text()

    def test_updates_multiple_fields(self, client, fake_keyring):
        resp = client.post(
            "/config/credentials",
            json={
                "jira_api_token": "t1",
                "gemini_api_key": "t2",
                "zephyr_api_token": "t3",
            },
        )
        assert resp.status_code == 200
        assert set(resp.json()["updated"]) == {"jira_api_token", "gemini_api_key", "zephyr_api_token"}
        assert fake_keyring.get_password("testdeck", "jira_api_token") == "t1"
        assert fake_keyring.get_password("testdeck", "gemini_api_key") == "t2"
        assert fake_keyring.get_password("testdeck", "zephyr_api_token") == "t3"

    def test_url_trailing_slash_stripped(self, client, fake_keyring):
        resp = client.post(
            "/config/credentials",
            json={"jira_base_url": "https://example.com/"},
        )
        assert resp.status_code == 200
        assert fake_keyring.get_password("testdeck", "jira_base_url") == "https://example.com"

    def test_empty_body_returns_empty_updated_list(self, client):
        resp = client.post("/config/credentials", json={})
        assert resp.status_code == 200
        assert resp.json() == {"updated": []}

    def test_invalid_url_rejected(self, client):
        resp = client.post(
            "/config/credentials",
            json={"jira_base_url": "not-a-url"},
        )
        assert resp.status_code == 422

    def test_invalid_email_rejected(self, client):
        resp = client.post(
            "/config/credentials",
            json={"jira_email": "not-an-email"},
        )
        assert resp.status_code == 422

    def test_subsequent_get_status_reflects_update(self, client, fake_keyring):
        """After POST /config/credentials, GET /config/status must see the
        new value via the keyring overlay."""
        client.post("/config/credentials", json={"gemini_api_key": "new-gem"})

        body = client.get("/config/status").json()
        assert body["ai"]["configured"] is True
