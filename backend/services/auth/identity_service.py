"""Identity service (Phase 17).

Backend-managed OAuth onboarding for HCSS sign-in. Sequences three
providers (Entra -> GitHub -> Atlassian), stores tokens in the keyring,
lazily refreshes on read, and exposes a stable accessor surface used by:

- Phase 18 managed MCP env injection (`get_provider_token`).
- Phase 17 service/adapter token preference (`get_oauth_access_token`).

This file replaces the Phase 18 PAT shim. The PAT shim API is preserved:
when no OAuth token exists, `get_provider_token` falls back to existing
manual settings so MCP managed connections keep working.

Never logs token/refresh values. Token storage uses backend keyring.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass
from typing import Optional, Sequence

import httpx
import structlog

from . import atlassian as atlassian_oauth
from . import entra as entra_oauth
from . import github as github_oauth
from .oauth_base import (
    OAuthTokenSet,
    derive_code_challenge,
    generate_code_verifier,
    generate_state,
    is_flow_expired,
    parse_state_provider,
)

try:
    from backend.utils.keyring_store import (
        delete_credential,
        get_credential,
        set_credential,
    )
except ImportError:  # pragma: no cover
    from utils.keyring_store import (
        delete_credential,
        get_credential,
        set_credential,
    )


logger = structlog.get_logger("testdeck.auth.identity")


PROVIDER_ORDER: list[str] = ["entra", "github", "atlassian"]
SUPPORTED_PROVIDERS: set[str] = set(PROVIDER_ORDER)


def _settings():
    try:
        from backend.config.settings import get_settings
    except ImportError:  # pragma: no cover
        from config.settings import get_settings
    return get_settings()


# ---------------------------------------------------------------------------
# Compat with Phase 18 managed MCP env injection
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProviderToken:
    """Used by Phase 18 managed MCP env resolution."""

    provider: str
    access_token: str
    metadata: dict[str, str]

    @property
    def ok(self) -> bool:
        return bool(self.access_token)


# ---------------------------------------------------------------------------
# Keyring keys
# ---------------------------------------------------------------------------


def _k_access(provider: str) -> str:
    return f"oauth_{provider}_access_token"


def _k_refresh(provider: str) -> str:
    return f"oauth_{provider}_refresh_token"


def _k_expires_at(provider: str) -> str:
    return f"oauth_{provider}_expires_at"


def _k_needs_reconnect(provider: str) -> str:
    return f"oauth_{provider}_needs_reconnect"


def _k_display(provider: str) -> str:
    return f"oauth_{provider}_display"


_K_PROFILE_DISPLAY = "oauth_identity_display_name"
_K_PROFILE_EMAIL = "oauth_identity_email"
_K_PROFILE_TENANT = "oauth_identity_tenant_id"

_K_ATLASSIAN_CLOUD_ID = "oauth_atlassian_cloud_id"
_K_ATLASSIAN_SITE_URL = "oauth_atlassian_site_url"


def _read_int(key: str) -> int:
    raw = get_credential(key) or ""
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def _read_bool(key: str) -> bool:
    return (get_credential(key) or "").lower() == "true"


def _store_token_set(provider: str, tok: OAuthTokenSet) -> None:
    set_credential(_k_access(provider), tok.access_token)
    set_credential(_k_refresh(provider), tok.refresh_token or "")
    set_credential(_k_expires_at(provider), str(tok.expires_at or 0))
    set_credential(_k_needs_reconnect(provider), "false")
    logger.info(
        "oauth_token_stored",
        provider=provider,
        has_refresh=bool(tok.refresh_token),
        expires_at=tok.expires_at,
        token_fp=tok.fingerprint,
    )


def _read_token_set(provider: str) -> Optional[OAuthTokenSet]:
    access = get_credential(_k_access(provider)) or ""
    if not access:
        return None
    return OAuthTokenSet(
        access_token=access,
        refresh_token=get_credential(_k_refresh(provider)) or "",
        expires_at=_read_int(_k_expires_at(provider)),
    )


def _wipe_provider(provider: str) -> None:
    for k in (
        _k_access(provider),
        _k_refresh(provider),
        _k_expires_at(provider),
        _k_needs_reconnect(provider),
        _k_display(provider),
    ):
        delete_credential(k)


def _mark_needs_reconnect(provider: str, reason: str = "") -> None:
    set_credential(_k_needs_reconnect(provider), "true")
    logger.info("oauth_needs_reconnect", provider=provider, reason=reason or "")


# ---------------------------------------------------------------------------
# Pending OAuth flow state (in-memory)
# ---------------------------------------------------------------------------


@dataclass
class _PendingFlow:
    flow_id: str
    current_provider: str
    providers_remaining: list[str]
    code_verifier: str
    state: str
    created_at: int


_pending_flows: dict[str, _PendingFlow] = {}
_flows_lock = asyncio.Lock()


def _prune_expired_flows() -> None:
    for fid in list(_pending_flows.keys()):
        flow = _pending_flows[fid]
        if is_flow_expired(flow.created_at):
            logger.info("oauth_flow_expired", flow_id=fid)
            _pending_flows.pop(fid, None)


def _build_authorize_for(
    provider: str,
    *,
    state: str,
    code_challenge: str,
) -> str:
    s = _settings()
    if provider == "entra":
        return entra_oauth.authorize_url(
            tenant_id=s.oauth_entra_tenant_id,
            client_id=s.oauth_entra_client_id,
            redirect_base_url=s.oauth_redirect_base_url,
            state=state,
            code_challenge=code_challenge,
        )
    if provider == "github":
        return github_oauth.authorize_url(
            client_id=s.oauth_github_client_id,
            redirect_base_url=s.oauth_redirect_base_url,
            state=state,
            code_challenge=code_challenge,
        )
    if provider == "atlassian":
        return atlassian_oauth.authorize_url(
            client_id=s.oauth_atlassian_client_id,
            redirect_base_url=s.oauth_redirect_base_url,
            state=state,
            code_challenge=code_challenge,
        )
    raise ValueError(f"unknown_provider:{provider}")


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------


class OAuthConfigError(RuntimeError):
    def __init__(self, missing: list[str]):
        super().__init__(f"oauth_not_configured:{','.join(missing)}")
        self.missing = missing


async def start_flow(
    providers: Sequence[str] | None = None,
) -> dict:
    """Begin a sequential OAuth flow. Returns flow_id + first authorize_url."""
    s = _settings()
    missing = s.missing_oauth_settings()
    if missing:
        raise OAuthConfigError(missing)

    seq = [p for p in (providers or PROVIDER_ORDER) if p in SUPPORTED_PROVIDERS]
    if not seq:
        seq = list(PROVIDER_ORDER)

    flow_id = secrets.token_urlsafe(16)
    current = seq[0]
    verifier = generate_code_verifier()
    challenge = derive_code_challenge(verifier)
    state = generate_state(current, flow_id)

    async with _flows_lock:
        _prune_expired_flows()
        _pending_flows[flow_id] = _PendingFlow(
            flow_id=flow_id,
            current_provider=current,
            providers_remaining=list(seq),
            code_verifier=verifier,
            state=state,
            created_at=int(time.time()),
        )

    authorize_url = _build_authorize_for(
        current, state=state, code_challenge=challenge
    )
    logger.info(
        "oauth_flow_started",
        flow_id=flow_id,
        provider=current,
        providers=seq,
    )
    return {"flow_id": flow_id, "authorize_url": authorize_url, "provider": current}


async def start_reconnect(provider: str) -> dict:
    """Start a single-provider OAuth flow without touching other providers."""
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"unknown_provider:{provider}")
    return await start_flow(providers=[provider])


@dataclass
class CallbackResult:
    completed: bool
    next_authorize_url: str = ""
    next_provider: str = ""
    error: str = ""


async def handle_callback(
    *,
    provider: str,
    code: str,
    state: str,
    http_client: httpx.AsyncClient | None = None,
) -> CallbackResult:
    """Validate state, exchange code, store token, advance sequence."""
    if not provider or provider not in SUPPORTED_PROVIDERS:
        return CallbackResult(completed=False, error="unknown_provider")
    if not code or not state:
        return CallbackResult(completed=False, error="missing_callback_params")
    parsed = parse_state_provider(state)
    if parsed != provider:
        return CallbackResult(completed=False, error="state_provider_mismatch")

    async with _flows_lock:
        _prune_expired_flows()
        # Find the flow whose state matches.
        flow: Optional[_PendingFlow] = None
        for f in _pending_flows.values():
            if f.state == state and f.current_provider == provider:
                flow = f
                break
        if flow is None:
            return CallbackResult(completed=False, error="invalid_state")
        verifier = flow.code_verifier
        flow_id = flow.flow_id

    try:
        await _exchange_and_store(provider, code, verifier, http_client)
    except OAuthConfigError:
        async with _flows_lock:
            _pending_flows.pop(flow_id, None)
        return CallbackResult(completed=False, error="oauth_not_configured")
    except Exception as exc:
        logger.warning(
            "oauth_exchange_failed",
            provider=provider,
            error_class=type(exc).__name__,
        )
        async with _flows_lock:
            _pending_flows.pop(flow_id, None)
        return CallbackResult(completed=False, error="exchange_failed")

    # Advance sequence.
    async with _flows_lock:
        flow = _pending_flows.get(flow_id)
        if flow is None:
            return CallbackResult(completed=True)
        try:
            flow.providers_remaining.remove(provider)
        except ValueError:
            pass
        if not flow.providers_remaining:
            _pending_flows.pop(flow_id, None)
            logger.info("oauth_flow_completed", flow_id=flow_id)
            return CallbackResult(completed=True)
        next_provider = flow.providers_remaining[0]
        next_verifier = generate_code_verifier()
        next_challenge = derive_code_challenge(next_verifier)
        next_state = generate_state(next_provider, flow_id)
        flow.current_provider = next_provider
        flow.code_verifier = next_verifier
        flow.state = next_state

    next_url = _build_authorize_for(
        next_provider, state=next_state, code_challenge=next_challenge
    )
    return CallbackResult(
        completed=False,
        next_authorize_url=next_url,
        next_provider=next_provider,
    )


async def _exchange_and_store(
    provider: str,
    code: str,
    code_verifier: str,
    http_client: httpx.AsyncClient | None,
) -> None:
    s = _settings()
    if provider == "entra":
        tok = await entra_oauth.exchange_code(
            tenant_id=s.oauth_entra_tenant_id,
            client_id=s.oauth_entra_client_id,
            redirect_base_url=s.oauth_redirect_base_url,
            code=code,
            code_verifier=code_verifier,
            http_client=http_client,
        )
        _store_token_set(provider, tok)
        profile = await entra_oauth.fetch_profile(
            tok.access_token, http_client=http_client
        )
        if profile.get("display_name"):
            set_credential(_K_PROFILE_DISPLAY, profile["display_name"])
            set_credential(_k_display(provider), profile["display_name"])
        if profile.get("email"):
            set_credential(_K_PROFILE_EMAIL, profile["email"])
        if s.oauth_entra_tenant_id:
            set_credential(_K_PROFILE_TENANT, s.oauth_entra_tenant_id)
        return
    if provider == "github":
        tok = await github_oauth.exchange_code(
            client_id=s.oauth_github_client_id,
            redirect_base_url=s.oauth_redirect_base_url,
            code=code,
            code_verifier=code_verifier,
            http_client=http_client,
        )
        _store_token_set(provider, tok)
        profile = await github_oauth.fetch_profile(
            tok.access_token, http_client=http_client
        )
        if profile.get("login"):
            set_credential(_k_display(provider), profile["login"])
        return
    if provider == "atlassian":
        tok = await atlassian_oauth.exchange_code(
            client_id=s.oauth_atlassian_client_id,
            redirect_base_url=s.oauth_redirect_base_url,
            code=code,
            code_verifier=code_verifier,
            http_client=http_client,
        )
        _store_token_set(provider, tok)
        resources = await atlassian_oauth.fetch_accessible_resources(
            tok.access_token, http_client=http_client
        )
        chosen = atlassian_oauth.select_resource(resources, s.jira_base_url)
        if chosen:
            set_credential(_K_ATLASSIAN_CLOUD_ID, chosen.get("id", ""))
            set_credential(_K_ATLASSIAN_SITE_URL, chosen.get("url", ""))
            set_credential(_k_display(provider), chosen.get("name") or chosen.get("url", ""))
        return
    raise ValueError(f"unknown_provider:{provider}")


async def refresh_provider(
    provider: str,
    *,
    http_client: httpx.AsyncClient | None = None,
) -> bool:
    """Lazily refresh `provider` if its access token is close to expiry.
    Returns True on success/no-op, False if refresh failed."""
    tok = _read_token_set(provider)
    if tok is None:
        return False
    if not tok.is_expired:
        return True
    s = _settings()
    try:
        if provider == "entra":
            new_tok = await entra_oauth.refresh(
                tenant_id=s.oauth_entra_tenant_id,
                client_id=s.oauth_entra_client_id,
                refresh_token=tok.refresh_token,
                http_client=http_client,
            )
        elif provider == "github":
            new_tok = await github_oauth.refresh(
                client_id=s.oauth_github_client_id,
                refresh_token=tok.refresh_token,
                http_client=http_client,
            )
        elif provider == "atlassian":
            new_tok = await atlassian_oauth.refresh(
                client_id=s.oauth_atlassian_client_id,
                refresh_token=tok.refresh_token,
                http_client=http_client,
            )
        else:
            return False
    except Exception as exc:
        _mark_needs_reconnect(provider, reason=type(exc).__name__)
        return False
    # Atlassian/GitHub may return new refresh_token; some flows keep the old one.
    if not new_tok.refresh_token:
        new_tok = OAuthTokenSet(
            access_token=new_tok.access_token,
            refresh_token=tok.refresh_token,
            expires_at=new_tok.expires_at,
            scope=new_tok.scope,
            token_type=new_tok.token_type,
            extra=new_tok.extra,
        )
    _store_token_set(provider, new_tok)
    return True


async def refresh_all() -> dict[str, bool]:
    """Refresh providers in parallel, swallowing individual failures."""
    results: dict[str, bool] = {}
    async with httpx.AsyncClient(timeout=15.0) as client:
        coros = {p: refresh_provider(p, http_client=client) for p in PROVIDER_ORDER}
        gathered = await asyncio.gather(*coros.values(), return_exceptions=True)
        for p, res in zip(coros.keys(), gathered):
            results[p] = bool(res) if not isinstance(res, Exception) else False
    return results


# ---------------------------------------------------------------------------
# Token accessors used by services/adapters
# ---------------------------------------------------------------------------


def get_oauth_access_token(provider: str) -> Optional[str]:
    """Synchronous read used on the hot path. Refresh is opportunistic and
    happens via /auth/refresh + /auth/me; callers that need a guaranteed
    fresh token should call `get_oauth_access_token_fresh`."""
    tok = _read_token_set(provider)
    if tok is None or not tok.access_token:
        return None
    if _read_bool(_k_needs_reconnect(provider)):
        return None
    if tok.is_expired:
        # Expired; force callers to fall back to PAT until refresh runs.
        return None
    return tok.access_token


async def get_oauth_access_token_fresh(provider: str) -> Optional[str]:
    tok = _read_token_set(provider)
    if tok is None:
        return None
    if tok.is_expired:
        ok = await refresh_provider(provider)
        if not ok:
            return None
        tok = _read_token_set(provider)
    return tok.access_token if tok else None


def get_atlassian_cloud_info() -> tuple[str, str]:
    return (
        get_credential(_K_ATLASSIAN_CLOUD_ID) or "",
        get_credential(_K_ATLASSIAN_SITE_URL) or "",
    )


def get_provider_token(provider: str) -> Optional[ProviderToken]:
    """Stable Phase 18 surface: prefer OAuth, fall back to PAT settings."""
    s = _settings()
    if provider == "atlassian":
        oauth_access = get_oauth_access_token("atlassian")
        if oauth_access:
            cloud_id, site_url = get_atlassian_cloud_info()
            return ProviderToken(
                provider="atlassian",
                access_token=oauth_access,
                metadata={
                    "site_url": site_url or s.jira_base_url,
                    "cloud_id": cloud_id,
                    "username": s.jira_email,
                    "auth_mode": "oauth",
                },
            )
        if s.jira_configured:
            return ProviderToken(
                provider="atlassian",
                access_token=s.jira_api_token,
                metadata={
                    "site_url": s.jira_base_url,
                    "username": s.jira_email,
                    "auth_mode": "manual",
                },
            )
        return None
    if provider == "github":
        oauth_access = get_oauth_access_token("github")
        if oauth_access:
            return ProviderToken(
                provider="github",
                access_token=oauth_access,
                metadata={"auth_mode": "oauth"},
            )
        if s.github_configured:
            return ProviderToken(
                provider="github",
                access_token=s.github_access_token,
                metadata={"auth_mode": "manual"},
            )
        return None
    if provider == "ado":
        # ADO bearer token comes from Entra. Org name still needed.
        oauth_access = get_oauth_access_token("entra")
        if oauth_access:
            return ProviderToken(
                provider="ado",
                access_token=oauth_access,
                metadata={"org": s.ado_org, "auth_mode": "oauth"},
            )
        if s.ado_configured:
            return ProviderToken(
                provider="ado",
                access_token=s.ado_access_token,
                metadata={"org": s.ado_org, "auth_mode": "manual"},
            )
        return None
    if provider == "entra":
        oauth_access = get_oauth_access_token("entra")
        if oauth_access:
            return ProviderToken(
                provider="entra",
                access_token=oauth_access,
                metadata={"auth_mode": "oauth"},
            )
        return None
    return None


def token_present(provider: str) -> bool:
    tok = get_provider_token(provider)
    return tok is not None and tok.ok


def fingerprint(token: str) -> str:
    if not token:
        return ""
    return f"len{len(token)}#{hash(token) & 0xFFFF:04x}"


# ---------------------------------------------------------------------------
# Status / sign-out
# ---------------------------------------------------------------------------


def _provider_status(provider: str) -> dict:
    tok = _read_token_set(provider)
    connected = bool(tok and tok.access_token)
    needs_reconnect = _read_bool(_k_needs_reconnect(provider))
    display = get_credential(_k_display(provider)) or ""
    return {
        "connected": connected and not needs_reconnect,
        "needs_reconnect": needs_reconnect,
        "auth_mode": "oauth" if connected else "none",
        "display": display,
        "expires_at": int(tok.expires_at) if tok else 0,
    }


def _manual_status() -> dict[str, bool]:
    s = _settings()
    return {
        "jira": bool(s.jira_configured),
        "github": bool(s.github_configured),
        "ado": bool(s.ado_configured),
    }


def list_provider_status() -> dict[str, dict]:
    """Compact provider statuses, OAuth + manual fallback combined."""
    out: dict[str, dict] = {}
    for p in PROVIDER_ORDER:
        out[p] = _provider_status(p)
    # Phase 18 callers expect ado/sql_server keys too.
    s = _settings()
    out["ado"] = _provider_status("entra") if get_oauth_access_token("entra") else {
        "connected": bool(s.ado_configured),
        "needs_reconnect": False,
        "auth_mode": "manual" if s.ado_configured else "none",
        "display": s.ado_org or "",
        "expires_at": 0,
    }
    out["sql_server"] = {
        "connected": bool(s.sql_server_configured),
        "needs_reconnect": False,
        "auth_mode": "manual" if s.sql_server_configured else "none",
        "display": "",
        "expires_at": 0,
    }
    return out


def identity_profile() -> Optional[dict]:
    name = get_credential(_K_PROFILE_DISPLAY) or ""
    email = get_credential(_K_PROFILE_EMAIL) or ""
    tenant = get_credential(_K_PROFILE_TENANT) or ""
    if not (name or email):
        return None
    return {
        "display_name": name,
        "email": email,
        "tenant_id": tenant,
    }


def get_identity_status() -> dict:
    profile = identity_profile()
    providers = {p: _provider_status(p) for p in PROVIDER_ORDER}
    signed_in = profile is not None and any(
        s["connected"] for s in providers.values()
    )
    return {
        "signed_in": bool(signed_in),
        "profile": profile,
        "providers": providers,
        "manual_fallbacks": _manual_status(),
    }


def sign_out() -> None:
    """Delete OAuth tokens + profile. Manual PATs untouched."""
    for provider in PROVIDER_ORDER:
        _wipe_provider(provider)
    for key in (
        _K_PROFILE_DISPLAY,
        _K_PROFILE_EMAIL,
        _K_PROFILE_TENANT,
        _K_ATLASSIAN_CLOUD_ID,
        _K_ATLASSIAN_SITE_URL,
    ):
        delete_credential(key)
    logger.info("oauth_signed_out")


# Test hooks ----------------------------------------------------------------


def _reset_pending_flows_for_tests() -> None:
    _pending_flows.clear()


def required_env_present(provider: str, keys=None) -> bool:
    """Phase 18 legacy compat — true when we have a token + required metadata."""
    tok = get_provider_token(provider)
    if not tok or not tok.ok:
        return False
    if provider == "atlassian":
        return bool(tok.metadata.get("site_url"))
    if provider == "ado":
        return bool(tok.metadata.get("org"))
    return True
