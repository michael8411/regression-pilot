"""Phase 17 — service/adapter token preference.

We don't hit real GitHub/ADO/Atlassian endpoints. We capture the
Authorization header httpx sees via a MockTransport.
"""

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


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------------------


def test_github_service_prefers_oauth_token(fake_keyring, monkeypatch):
    """Phase 17 — github_service._preferred_token picks OAuth over PAT."""
    from utils.keyring_store import set_credential

    _force_settings({"github_access_token": "pat-fallback"})
    set_credential("oauth_github_access_token", "oauth-win")
    set_credential("oauth_github_expires_at", str(int(time.time()) + 3600))

    from services import github_service

    assert github_service._preferred_token() == "oauth-win"


def test_github_service_falls_back_to_pat(fake_keyring):
    _force_settings({"github_access_token": "pat-fallback"})
    from services import github_service

    assert github_service._preferred_token() == "pat-fallback"


def test_github_adapter_uses_oauth_token(fake_keyring):
    """GithubRestAdapter health/effective should pick the OAuth token."""
    from utils.keyring_store import set_credential

    _force_settings({"github_access_token": "pat-fallback"})
    set_credential("oauth_github_access_token", "oauth-win")
    set_credential("oauth_github_expires_at", str(int(time.time()) + 3600))

    from services.provider_adapters.github import GithubRestAdapter

    adapter = GithubRestAdapter()
    assert adapter._effective_token() == "oauth-win"


# ---------------------------------------------------------------------------
# Azure DevOps
# ---------------------------------------------------------------------------


def test_ado_service_prefers_oauth_bearer(fake_keyring):
    from utils.keyring_store import set_credential

    _force_settings({"ado_org": "myorg", "ado_access_token": "pat-fallback"})
    set_credential("oauth_entra_access_token", "entra-win")
    set_credential("oauth_entra_expires_at", str(int(time.time()) + 3600))

    from services.ado_service import _preferred_token

    tok, mode = _preferred_token()
    assert tok == "entra-win"
    assert mode == "oauth"


def test_ado_service_falls_back_to_pat(fake_keyring):
    _force_settings({"ado_org": "myorg", "ado_access_token": "pat-fallback"})
    from services.ado_service import _preferred_token

    tok, mode = _preferred_token()
    assert tok == "pat-fallback"
    assert mode == "pat"


def test_ado_headers_oauth_uses_bearer_auth():
    from services.ado_service import _headers

    h = _headers("tok", auth_mode="oauth")
    assert h["Authorization"] == "Bearer tok"


def test_ado_headers_pat_uses_basic_auth():
    from services.ado_service import _headers

    h = _headers("pat", auth_mode="pat")
    assert h["Authorization"].startswith("Basic ")


def test_ado_adapter_oauth_preference(fake_keyring):
    from utils.keyring_store import set_credential

    _force_settings({"ado_org": "myorg", "ado_access_token": "pat-fallback"})
    set_credential("oauth_entra_access_token", "entra-win")
    set_credential("oauth_entra_expires_at", str(int(time.time()) + 3600))

    from services.provider_adapters.ado import AdoRestAdapter

    a = AdoRestAdapter()
    tok, mode = a._effective_token()
    assert tok == "entra-win"
    assert mode == "oauth"


# ---------------------------------------------------------------------------
# Jira / Atlassian
# ---------------------------------------------------------------------------


def test_jira_service_uses_atlassian_oauth_cloud_url(fake_keyring):
    from utils.keyring_store import set_credential

    _force_settings(
        {
            "jira_base_url": "https://hcss.atlassian.net",
            "jira_email": "u@example.com",
            "jira_api_token": "pat-jira",
        }
    )
    set_credential("oauth_atlassian_access_token", "atl-tok")
    set_credential("oauth_atlassian_expires_at", str(int(time.time()) + 3600))
    set_credential("oauth_atlassian_cloud_id", "cloud-1")
    set_credential("oauth_atlassian_site_url", "https://hcss.atlassian.net")

    from services import jira_service

    assert jira_service._base_url() == "https://api.atlassian.com/ex/jira/cloud-1"


def test_jira_service_falls_back_to_pat_when_no_oauth(fake_keyring):
    _force_settings(
        {
            "jira_base_url": "https://hcss.atlassian.net",
            "jira_email": "u@example.com",
            "jira_api_token": "pat-jira",
        }
    )
    from services import jira_service

    assert jira_service._base_url() == "https://hcss.atlassian.net"


def test_jira_client_uses_bearer_when_oauth_available(fake_keyring):
    from utils.keyring_store import set_credential

    _force_settings(
        {
            "jira_base_url": "https://hcss.atlassian.net",
            "jira_email": "u@example.com",
            "jira_api_token": "pat-jira",
        }
    )
    set_credential("oauth_atlassian_access_token", "atl-tok")
    set_credential("oauth_atlassian_expires_at", str(int(time.time()) + 3600))
    set_credential("oauth_atlassian_cloud_id", "cloud-1")
    set_credential("oauth_atlassian_site_url", "https://hcss.atlassian.net")

    from services import jira_service

    async def go():
        async with await jira_service._client() as c:
            return c.headers.get("Authorization")

    auth = _run(go())
    assert auth == "Bearer atl-tok"
