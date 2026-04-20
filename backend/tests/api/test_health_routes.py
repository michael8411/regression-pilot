"""Tests for backend/api/health_routes.py.

Uses FastAPI TestClient against a minimal app that mounts only the health
router — so we don't need Gemini credentials or any other startup cost.
"""

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
def client(fake_keyring, baseline_env):
    from api.health_routes import router

    app = FastAPI(version="0.2.0-test")
    app.include_router(router)
    return TestClient(app)


class TestHealthEndpoint:

    def test_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_shape(self, client):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["version"] == "0.2.0-test"
        assert "jira_configured" in body
        assert "ai_configured" in body
        assert "zephyr_configured" in body

    def test_reports_configured_true_when_env_populated(self, client):
        body = client.get("/health").json()
        assert body["jira_configured"] is True
        assert body["ai_configured"] is True
        assert body["zephyr_configured"] is True

