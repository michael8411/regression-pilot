"""Tests for the per-launch local auth middleware."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


TOKEN = "test-token-abc123"


@pytest.fixture
def client(monkeypatch):
    import security.local_auth as la_mod

    monkeypatch.setattr(la_mod, "LOCAL_AUTH_TOKEN", TOKEN)

    from security.local_auth import LocalAuthMiddleware

    app = FastAPI()
    app.add_middleware(LocalAuthMiddleware)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/auth/callback/github")
    async def callback():
        return {"provider": "github"}

    @app.get("/protected")
    async def protected():
        return {"secret": "data"}

    return TestClient(app, raise_server_exceptions=False)


class TestPublicPaths:

    def test_health_accessible_without_token(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_oauth_callback_accessible_without_token(self, client):
        resp = client.get("/auth/callback/github")
        assert resp.status_code == 200

    def test_options_accessible_without_token(self, client):
        resp = client.options("/protected")
        # OPTIONS may return 405 (method not allowed) or 200 depending on route
        # but must NOT return 401 from our middleware.
        assert resp.status_code != 401


class TestProtectedPaths:

    def test_missing_token_returns_401(self, client):
        resp = client.get("/protected")
        assert resp.status_code == 401

    def test_wrong_token_returns_401(self, client):
        resp = client.get("/protected", headers={"X-Testdeck-Auth": "wrong"})
        assert resp.status_code == 401

    def test_correct_token_allows_request(self, client):
        resp = client.get("/protected", headers={"X-Testdeck-Auth": TOKEN})
        assert resp.status_code == 200
        assert resp.json() == {"secret": "data"}

    def test_empty_token_returns_401(self, client):
        resp = client.get("/protected", headers={"X-Testdeck-Auth": ""})
        assert resp.status_code == 401

    def test_401_response_has_detail_key(self, client):
        resp = client.get("/protected")
        body = resp.json()
        assert "detail" in body

    def test_401_response_has_marker_header(self, client):
        """Frontend uses this header to distinguish a backend-auth 401
        (retry with fresh token) from an upstream-provider 401."""
        resp = client.get("/protected")
        assert resp.headers.get("X-Testdeck-Auth-Required") == "1"

    def test_correct_token_response_has_no_marker_header(self, client):
        resp = client.get("/protected", headers={"X-Testdeck-Auth": TOKEN})
        assert resp.status_code == 200
        assert resp.headers.get("X-Testdeck-Auth-Required") is None


class TestTokenNotLogged:

    def test_token_value_not_in_local_auth_module_source(self):
        """Sanity check: the token must not appear verbatim in security/local_auth.py source."""
        import pathlib
        src = (pathlib.Path(__file__).parent.parent.parent / "security" / "local_auth.py").read_text()
        # The test token should not be hardcoded in the source.
        assert TOKEN not in src
