"""GitHub OAuth client (Phase 17).

We support the OAuth App flow with PKCE. If HCSS picks a GitHub App
instead, swap exchange_code internals; the public surface stays the same.
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

logger = structlog.get_logger("testdeck.auth.github")

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"
API_URL = "https://api.github.com"

DEFAULT_SCOPES = ["repo", "read:org", "user:email"]


def authorize_url(
    *,
    client_id: str,
    redirect_base_url: str,
    state: str,
    code_challenge: str,
    scopes: list[str] | None = None,
) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": build_redirect_uri(redirect_base_url, "github"),
        "scope": " ".join(scopes or DEFAULT_SCOPES),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "allow_signup": "false",
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
        "client_id": client_id,
        "code": code,
        "redirect_uri": build_redirect_uri(redirect_base_url, "github"),
        "code_verifier": code_verifier,
    }
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=15.0)
    try:
        resp = await client.post(
            TOKEN_URL,
            data=data,
            headers={"Accept": "application/json"},
        )
        if resp.status_code >= 400:
            logger.warning(
                "github_token_exchange_failed",
                status=resp.status_code,
                error=redact_error(resp.text),
            )
            raise RuntimeError(f"github_token_failed:{resp.status_code}")
        body = resp.json()
        if "error" in body and body.get("error"):
            # GitHub returns 200 with {"error": "..."} on bad code.
            logger.warning(
                "github_token_exchange_rejected",
                error=redact_error(str(body.get("error"))),
            )
            raise RuntimeError("github_token_rejected")
    finally:
        if owns_client:
            await client.aclose()
    return _to_token_set(body)


async def refresh(
    *,
    client_id: str,
    refresh_token: str,
    http_client: httpx.AsyncClient | None = None,
) -> OAuthTokenSet:
    """GitHub OAuth Apps may not return refresh tokens — GitHub Apps do.
    Callers should fall back to reconnect when refresh_token is empty."""
    if not refresh_token:
        raise RuntimeError("github_refresh_unsupported")
    data = {
        "client_id": client_id,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=15.0)
    try:
        resp = await client.post(
            TOKEN_URL,
            data=data,
            headers={"Accept": "application/json"},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"github_refresh_failed:{resp.status_code}")
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


async def fetch_profile(
    access_token: str,
    *,
    http_client: httpx.AsyncClient | None = None,
) -> dict:
    if not access_token:
        return {}
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=10.0)
    try:
        resp = await client.get(
            f"{API_URL}/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        if resp.status_code >= 400:
            return {}
        data = resp.json()
    finally:
        if owns_client:
            await client.aclose()
    return {
        "login": str(data.get("login") or ""),
        "display_name": str(data.get("name") or data.get("login") or ""),
        "email": str(data.get("email") or ""),
    }
