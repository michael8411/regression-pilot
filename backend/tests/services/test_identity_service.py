"""Phase 17 — identity_service flow, refresh, signout, and adapter prefs."""

from __future__ import annotations

import asyncio
import time

import httpx
import pytest


def _force_settings(values: dict) -> None:
    from config.settings import get_settings

    get_settings.cache_clear()
    s = get_settings()
    for k, v in values.items():
        object.__setattr__(s, k, v)


@pytest.fixture
def oauth_env(fake_keyring):
    _force_settings(
        {
            "oauth_entra_tenant_id": "tenant-1",
            "oauth_entra_client_id": "entra-client",
            "oauth_github_client_id": "gh-client",
            "oauth_atlassian_client_id": "atl-client",
            "oauth_redirect_base_url": "http://127.0.0.1:8000",
            "jira_base_url": "https://hcss.atlassian.net",
            "jira_email": "",
            "jira_api_token": "",
            "github_access_token": "",
            "ado_org": "",
            "ado_access_token": "",
        }
    )
    from services.auth import identity_service

    identity_service._reset_pending_flows_for_tests()
    yield identity_service
    identity_service._reset_pending_flows_for_tests()
    identity_service.sign_out()
    from config.settings import get_settings

    get_settings.cache_clear()


def _run(coro):
    return asyncio.run(coro)


def test_start_flow_returns_first_provider_authorize_url(oauth_env):
    res = _run(oauth_env.start_flow())
    assert res["provider"] == "entra"
    assert res["authorize_url"].startswith(
        "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/authorize"
    )
    assert res["flow_id"]


def test_start_flow_errors_when_oauth_missing(fake_keyring):
    _force_settings(
        {
            "oauth_entra_tenant_id": "",
            "oauth_entra_client_id": "",
            "oauth_github_client_id": "",
            "oauth_atlassian_client_id": "",
        }
    )
    from services.auth import identity_service

    with pytest.raises(identity_service.OAuthConfigError) as exc:
        _run(identity_service.start_flow())
    assert "oauth_entra_tenant_id" in exc.value.missing


def test_callback_rejects_invalid_state(oauth_env):
    _run(oauth_env.start_flow())
    result = _run(
        oauth_env.handle_callback(
            provider="entra", code="abc", state="entra.not-a-real-flow.xx"
        )
    )
    assert result.completed is False
    assert result.error == "invalid_state"


def test_callback_rejects_state_provider_mismatch(oauth_env):
    res = _run(oauth_env.start_flow())
    # State carries 'entra' but we claim 'github' in the URL.
    state = _state_for_pending(oauth_env)
    result = _run(
        oauth_env.handle_callback(provider="github", code="abc", state=state)
    )
    assert result.completed is False
    assert result.error == "state_provider_mismatch"
    assert res  # used


def _state_for_pending(oauth_env) -> str:
    flows = oauth_env._pending_flows
    assert flows, "expected a pending flow"
    return next(iter(flows.values())).state


def test_callback_advances_through_providers(oauth_env, monkeypatch):
    """Mock token exchange + profile fetch and ensure sequence advances."""
    from services.auth import identity_service
    from services.auth.oauth_base import OAuthTokenSet

    async def fake_entra_exchange(**kwargs):
        return OAuthTokenSet(
            access_token="entra-tok",
            refresh_token="entra-refresh",
            expires_at=int(time.time()) + 3600,
        )

    async def fake_gh_exchange(**kwargs):
        return OAuthTokenSet(
            access_token="gh-tok",
            refresh_token="",
            expires_at=int(time.time()) + 3600,
        )

    async def fake_atl_exchange(**kwargs):
        return OAuthTokenSet(
            access_token="atl-tok",
            refresh_token="atl-refresh",
            expires_at=int(time.time()) + 3600,
        )

    async def fake_entra_profile(token, **kwargs):
        return {"display_name": "Aaron", "email": "aaron@hcss.com"}

    async def fake_gh_profile(token, **kwargs):
        return {"login": "arinz", "display_name": "Aaron", "email": ""}

    async def fake_atl_resources(token, **kwargs):
        return [
            {"id": "cloud-1", "url": "https://hcss.atlassian.net", "name": "HCSS"}
        ]

    monkeypatch.setattr(
        identity_service.entra_oauth, "exchange_code", fake_entra_exchange
    )
    monkeypatch.setattr(
        identity_service.entra_oauth, "fetch_profile", fake_entra_profile
    )
    monkeypatch.setattr(
        identity_service.github_oauth, "exchange_code", fake_gh_exchange
    )
    monkeypatch.setattr(
        identity_service.github_oauth, "fetch_profile", fake_gh_profile
    )
    monkeypatch.setattr(
        identity_service.atlassian_oauth, "exchange_code", fake_atl_exchange
    )
    monkeypatch.setattr(
        identity_service.atlassian_oauth,
        "fetch_accessible_resources",
        fake_atl_resources,
    )

    _run(identity_service.start_flow())

    # Entra
    state = _state_for_pending(identity_service)
    r1 = _run(
        identity_service.handle_callback(
            provider="entra", code="c1", state=state
        )
    )
    assert r1.completed is False
    assert r1.next_provider == "github"
    assert r1.next_authorize_url.startswith("https://github.com/login/oauth")
    assert identity_service.get_oauth_access_token("entra") == "entra-tok"

    # GitHub
    state = _state_for_pending(identity_service)
    r2 = _run(
        identity_service.handle_callback(
            provider="github", code="c2", state=state
        )
    )
    assert r2.completed is False
    assert r2.next_provider == "atlassian"
    assert identity_service.get_oauth_access_token("github") == "gh-tok"

    # Atlassian (final)
    state = _state_for_pending(identity_service)
    r3 = _run(
        identity_service.handle_callback(
            provider="atlassian", code="c3", state=state
        )
    )
    assert r3.completed is True
    assert identity_service.get_oauth_access_token("atlassian") == "atl-tok"
    cloud_id, site_url = identity_service.get_atlassian_cloud_info()
    assert cloud_id == "cloud-1"
    assert site_url == "https://hcss.atlassian.net"


def test_auth_me_signed_out_when_no_tokens(oauth_env):
    status = oauth_env.get_identity_status()
    assert status["signed_in"] is False
    assert status["profile"] is None
    assert status["providers"]["entra"]["connected"] is False


def test_auth_me_signed_in_when_tokens_present(oauth_env):
    from utils.keyring_store import set_credential

    set_credential("oauth_entra_access_token", "tok")
    set_credential("oauth_entra_refresh_token", "ref")
    set_credential("oauth_entra_expires_at", str(int(time.time()) + 3600))
    set_credential("oauth_identity_display_name", "Aaron")
    set_credential("oauth_identity_email", "aaron@hcss.com")

    status = oauth_env.get_identity_status()
    assert status["signed_in"] is True
    assert status["profile"]["display_name"] == "Aaron"
    assert status["providers"]["entra"]["connected"] is True


def test_refresh_updates_access_token_and_expiry(oauth_env, monkeypatch):
    from services.auth.oauth_base import OAuthTokenSet
    from utils.keyring_store import get_credential, set_credential

    set_credential("oauth_entra_access_token", "old-tok")
    set_credential("oauth_entra_refresh_token", "ref")
    # Already expired so refresh runs.
    set_credential("oauth_entra_expires_at", str(int(time.time()) - 10))

    async def fake_refresh(**kwargs):
        return OAuthTokenSet(
            access_token="new-tok",
            refresh_token="ref",
            expires_at=int(time.time()) + 3600,
        )

    monkeypatch.setattr(oauth_env.entra_oauth, "refresh", fake_refresh)

    ok = _run(oauth_env.refresh_provider("entra"))
    assert ok is True
    assert get_credential("oauth_entra_access_token") == "new-tok"


def test_failed_refresh_marks_needs_reconnect(oauth_env, monkeypatch):
    from utils.keyring_store import set_credential

    set_credential("oauth_entra_access_token", "old-tok")
    set_credential("oauth_entra_refresh_token", "ref")
    set_credential("oauth_entra_expires_at", str(int(time.time()) - 10))

    async def boom(**kwargs):
        raise RuntimeError("refresh-failed")

    monkeypatch.setattr(oauth_env.entra_oauth, "refresh", boom)

    ok = _run(oauth_env.refresh_provider("entra"))
    assert ok is False
    status = oauth_env.get_identity_status()
    assert status["providers"]["entra"]["needs_reconnect"] is True


def test_sign_out_removes_oauth_keys_but_keeps_pats(oauth_env):
    from utils.keyring_store import get_credential, set_credential

    # OAuth state
    set_credential("oauth_entra_access_token", "tok")
    set_credential("oauth_identity_display_name", "Aaron")
    # Manual PATs (should survive sign-out)
    set_credential("github_access_token", "manual-gh")
    set_credential("ado_access_token", "manual-ado")

    oauth_env.sign_out()

    assert (get_credential("oauth_entra_access_token") or "") == ""
    assert (get_credential("oauth_identity_display_name") or "") == ""
    assert get_credential("github_access_token") == "manual-gh"
    assert get_credential("ado_access_token") == "manual-ado"


def test_get_provider_token_prefers_oauth_then_pat(oauth_env):
    from utils.keyring_store import set_credential

    # No OAuth, PAT only.
    _force_settings(
        {
            "github_access_token": "pat-gh",
            "ado_org": "myorg",
            "ado_access_token": "pat-ado",
            "jira_email": "u@example.com",
            "jira_api_token": "pat-jira",
            "jira_base_url": "https://hcss.atlassian.net",
        }
    )
    tok = oauth_env.get_provider_token("github")
    assert tok is not None and tok.access_token == "pat-gh"
    assert tok.metadata.get("auth_mode") == "manual"

    # Now add OAuth token; should win.
    set_credential("oauth_github_access_token", "oauth-gh")
    set_credential("oauth_github_refresh_token", "")
    set_credential(
        "oauth_github_expires_at", str(int(time.time()) + 3600)
    )
    tok2 = oauth_env.get_provider_token("github")
    assert tok2.access_token == "oauth-gh"
    assert tok2.metadata.get("auth_mode") == "oauth"


def test_expired_token_falls_back_to_pat(oauth_env):
    from utils.keyring_store import set_credential

    _force_settings({"github_access_token": "pat-gh"})
    set_credential("oauth_github_access_token", "oauth-gh")
    set_credential("oauth_github_expires_at", str(int(time.time()) - 60))

    tok = oauth_env.get_provider_token("github")
    assert tok.access_token == "pat-gh"
    assert tok.metadata.get("auth_mode") == "manual"
