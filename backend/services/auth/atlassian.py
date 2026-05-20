"""Atlassian OAuth 2.0 3LO client (Phase 17).

After token exchange we call /oauth/token/accessible-resources to find
the user's cloud sites, pick the one matching the configured Jira base
URL (or the only available one), and store cloud_id + site_url.
"""

from __future__ import annotations

from urllib.parse import urlencode

import httpx
import structlog

from .oauth_base import (
    OAuthTokenSet,
    build_redirect_uri,
    expires_at_from_now,
    redact_error,
)

logger = structlog.get_logger("testdeck.auth.atlassian")

AUTHORIZE_URL = "https://auth.atlassian.com/authorize"
TOKEN_URL = "https://auth.atlassian.com/oauth/token"
ACCESSIBLE_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources"

DEFAULT_SCOPES = [
    "read:jira-work",
    "read:jira-user",
    "write:jira-work",
    "offline_access",
]


def authorize_url(
    *,
    client_id: str,
    redirect_base_url: str,
    state: str,
    code_challenge: str,
    scopes: list[str] | None = None,
) -> str:
    params = {
        "audience": "api.atlassian.com",
        "client_id": client_id,
        "scope": " ".join(scopes or DEFAULT_SCOPES),
        "redirect_uri": build_redirect_uri(redirect_base_url, "atlassian"),
        "state": state,
        "response_type": "code",
        "prompt": "consent",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code(
    *,
    client_id: str,
    redirect_base_url: str,
    code: str,
    code_verifier: str,
    http_client: httpx.AsyncClient | None = None,
) -> OAuthTokenSet:
    data = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "redirect_uri": build_redirect_uri(redirect_base_url, "atlassian"),
        "code_verifier": code_verifier,
    }
    return await _post_token(data, http_client)


async def refresh(
    *,
    client_id: str,
    refresh_token: str,
    http_client: httpx.AsyncClient | None = None,
) -> OAuthTokenSet:
    if not refresh_token:
        raise RuntimeError("atlassian_refresh_unsupported")
    data = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
    }
    return await _post_token(data, http_client)


async def _post_token(
    data: dict,
    http_client: httpx.AsyncClient | None,
) -> OAuthTokenSet:
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=15.0)
    try:
        resp = await client.post(
            TOKEN_URL,
            json=data,
            headers={"Content-Type": "application/json"},
        )
        if resp.status_code >= 400:
            logger.warning(
                "atlassian_token_exchange_failed",
                status=resp.status_code,
                error=redact_error(resp.text),
            )
            raise RuntimeError(f"atlassian_token_failed:{resp.status_code}")
        body = resp.json()
    finally:
        if owns_client:
            await client.aclose()
    return _to_token_set(body)


def _to_token_set(body: dict) -> OAuthTokenSet:
    return OAuthTokenSet(
        access_token=str(body.get("access_token") or ""),
        refresh_token=str(body.get("refresh_token") or ""),
        expires_at=expires_at_from_now(body.get("expires_in")),
        scope=str(body.get("scope") or ""),
        token_type=str(body.get("token_type") or "Bearer"),
    )


async def fetch_accessible_resources(
    access_token: str,
    *,
    http_client: httpx.AsyncClient | None = None,
) -> list[dict]:
    if not access_token:
        return []
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=10.0)
    try:
        resp = await client.get(
            ACCESSIBLE_RESOURCES_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )
        if resp.status_code >= 400:
            logger.warning(
                "atlassian_accessible_resources_failed",
                status=resp.status_code,
            )
            return []
        data = resp.json()
    finally:
        if owns_client:
            await client.aclose()
    if not isinstance(data, list):
        return []
    return [
        {
            "id": str(r.get("id") or ""),
            "name": str(r.get("name") or ""),
            "url": str(r.get("url") or ""),
            "scopes": list(r.get("scopes") or []),
        }
        for r in data
        if isinstance(r, dict)
    ]


def select_resource(resources: list[dict], preferred_site_url: str) -> dict | None:
    """Prefer the resource matching `preferred_site_url`, else the first."""
    if not resources:
        return None
    if preferred_site_url:
        norm = preferred_site_url.rstrip("/").lower()
        for r in resources:
            if r.get("url", "").rstrip("/").lower() == norm:
                return r
    return resources[0]
