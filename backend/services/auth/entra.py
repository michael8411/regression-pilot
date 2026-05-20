"""Microsoft Entra ID OAuth client (Phase 17).

Authenticates the HCSS user and obtains an access token usable against
Azure DevOps. Public client + PKCE. Never logs tokens.
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

logger = structlog.get_logger("testdeck.auth.entra")


# Azure DevOps resource app id; user_impersonation is the canonical scope.
ADO_RESOURCE_APP_ID = "499b84ac-1321-427f-aa17-267ca6975798"

# These are HCSS-IT-confirmable. We list the standard recommended set.
DEFAULT_SCOPES = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "User.Read",
    f"{ADO_RESOURCE_APP_ID}/user_impersonation",
]


def _authorize_endpoint(tenant_id: str) -> str:
    return f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize"


def _token_endpoint(tenant_id: str) -> str:
    return f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"


def authorize_url(
    *,
    tenant_id: str,
    client_id: str,
    redirect_base_url: str,
    state: str,
    code_challenge: str,
    scopes: list[str] | None = None,
) -> str:
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": build_redirect_uri(redirect_base_url, "entra"),
        "response_mode": "query",
        "scope": " ".join(scopes or DEFAULT_SCOPES),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{_authorize_endpoint(tenant_id)}?{urlencode(params)}"


async def exchange_code(
    *,
    tenant_id: str,
    client_id: str,
    redirect_base_url: str,
    code: str,
    code_verifier: str,
    http_client: httpx.AsyncClient | None = None,
) -> OAuthTokenSet:
    data = {
        "client_id": client_id,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": build_redirect_uri(redirect_base_url, "entra"),
        "code_verifier": code_verifier,
    }
    return await _post_token(tenant_id, data, http_client)


async def refresh(
    *,
    tenant_id: str,
    client_id: str,
    refresh_token: str,
    http_client: httpx.AsyncClient | None = None,
) -> OAuthTokenSet:
    data = {
        "client_id": client_id,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }
    return await _post_token(tenant_id, data, http_client)


async def _post_token(
    tenant_id: str,
    data: dict,
    http_client: httpx.AsyncClient | None,
) -> OAuthTokenSet:
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=15.0)
    try:
        resp = await client.post(_token_endpoint(tenant_id), data=data)
        if resp.status_code >= 400:
            logger.warning(
                "entra_token_exchange_failed",
                status=resp.status_code,
                error=redact_error(resp.text),
            )
            raise RuntimeError(f"entra_token_failed:{resp.status_code}")
        body = resp.json()
    finally:
        if owns_client:
            await client.aclose()
    return _to_token_set(body)


def _to_token_set(body: dict) -> OAuthTokenSet:
    extra = {}
    if isinstance(body.get("id_token"), str):
        extra["id_token"] = body["id_token"]
    return OAuthTokenSet(
        access_token=str(body.get("access_token") or ""),
        refresh_token=str(body.get("refresh_token") or ""),
        expires_at=expires_at_from_now(body.get("expires_in")),
        scope=str(body.get("scope") or ""),
        token_type=str(body.get("token_type") or "Bearer"),
        extra=extra,
    )


async def fetch_profile(
    access_token: str,
    *,
    http_client: httpx.AsyncClient | None = None,
) -> dict:
    """Return {display_name, email, tenant_id?} from Microsoft Graph."""
    if not access_token:
        return {}
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=10.0)
    try:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code >= 400:
            logger.warning(
                "entra_profile_fetch_failed",
                status=resp.status_code,
                error=redact_error(resp.text),
            )
            return {}
        data = resp.json()
    finally:
        if owns_client:
            await client.aclose()
    return {
        "display_name": str(data.get("displayName") or data.get("userPrincipalName") or ""),
        "email": str(data.get("mail") or data.get("userPrincipalName") or ""),
    }
