"""Phase 17 — /auth/* route smoke tests."""

from __future__ import annotations

import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _force_settings(values: dict) -> None:
    from config.settings import get_settings

    get_settings.cache_clear()
    s = get_settings()
    for k, v in values.items():
        object.__setattr__(s, k, v)


@pytest.fixture
def client(fake_keyring):
    _force_settings(
        {
            "oauth_entra_tenant_id": "tenant-1",
            "oauth_entra_client_id": "entra-client",
            "oauth_github_client_id": "gh-client",
            "oauth_atlassian_client_id": "atl-client",
            "oauth_redirect_base_url": "http://127.0.0.1:8000",
        }
    )
    from api.auth_routes import router
    from services.auth import identity_service

    identity_service._reset_pending_flows_for_tests()
    app = FastAPI()
    app.include_router(router)
    yield TestClient(app)
    identity_service._reset_pending_flows_for_tests()
    identity_service.sign_out()


def test_post_start_returns_authorize_url(client):
    resp = client.post("/auth/start")
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "entra"
    assert body["authorize_url"].startswith("https://login.microsoftonline.com/")
    assert body["flow_id"]


def test_post_start_409_when_oauth_missing(fake_keyring):
    _force_settings(
        {
            "oauth_entra_tenant_id": "",
            "oauth_entra_client_id": "",
            "oauth_github_client_id": "",
            "oauth_atlassian_client_id": "",
        }
    )
    from api.auth_routes import router

    app = FastAPI()
    app.include_router(router)
    c = TestClient(app)
    resp = c.post("/auth/start")
    assert resp.status_code == 409
    body = resp.json()
    assert body["error"] == "oauth_not_configured"
    assert "oauth_entra_tenant_id" in body["missing"]


def test_callback_invalid_state_returns_failure_page(client):
    resp = client.get(
        "/auth/callback/entra",
        params={"code": "abc", "state": "entra.bad.xx"},
        follow_redirects=False,
    )
    assert resp.status_code == 400
    assert "could not connect" in resp.text


def test_me_signed_out_status(client):
    resp = client.get("/auth/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["signed_in"] is False
    assert body["profile"] is None
    assert "entra" in body["providers"]


def test_signout_route(client):
    from utils.keyring_store import get_credential, set_credential

    set_credential("oauth_entra_access_token", "tok")
    resp = client.post("/auth/signout")
    assert resp.status_code == 200
    assert resp.json()["signed_out"] is True
    assert (get_credential("oauth_entra_access_token") or "") == ""


def test_reconnect_route_unknown_provider(client):
    resp = client.post("/auth/reconnect/nope")
    assert resp.status_code == 400


def test_reconnect_route_returns_provider_url(client):
    resp = client.post("/auth/reconnect/github")
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "github"
    assert body["authorize_url"].startswith("https://github.com/login/oauth/")
