"""Auth routes (Phase 17).

POST /auth/start              - kick off Entra -> GitHub -> Atlassian
GET  /auth/callback/{provider} - OAuth redirect target, advances flow
GET  /auth/me                 - signed-in profile + provider statuses
POST /auth/reconnect/{provider} - single-provider OAuth flow
POST /auth/refresh            - lazy refresh + needs_reconnect bookkeeping
POST /auth/signout            - wipe OAuth tokens (keeps PATs)

The callback returns small HTML pages so the browser tab can show a
clean confirmation without exposing payloads.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

try:
    from backend.services.auth import identity_service
    from backend.services.auth.identity_service import OAuthConfigError
except ImportError:  # pragma: no cover
    from services.auth import identity_service
    from services.auth.identity_service import OAuthConfigError


router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Start / reconnect
# ---------------------------------------------------------------------------


@router.post("/start")
async def auth_start(_request: Request):
    try:
        return await identity_service.start_flow()
    except OAuthConfigError as exc:
        return JSONResponse(
            status_code=409,
            content={
                "error": "oauth_not_configured",
                "missing": list(exc.missing),
                "detail": (
                    "OAuth is not configured. Ask your administrator to set the"
                    " missing values in Settings."
                ),
            },
        )


@router.post("/reconnect/{provider}")
async def auth_reconnect(provider: str):
    if provider not in identity_service.SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail="unknown_provider")
    try:
        return await identity_service.start_reconnect(provider)
    except OAuthConfigError as exc:
        return JSONResponse(
            status_code=409,
            content={
                "error": "oauth_not_configured",
                "missing": list(exc.missing),
            },
        )


# ---------------------------------------------------------------------------
# Callback
# ---------------------------------------------------------------------------


def _success_page() -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><html><head><title>Testdeck</title>"
        "<style>body{font:14px system-ui;margin:48px;color:#1f2937}</style>"
        "</head><body>"
        "<h1>You're signed in to Testdeck.</h1>"
        "<p>You can close this tab.</p>"
        "</body></html>"
    )


def _failure_page(provider: str, code: str) -> HTMLResponse:
    safe_provider = (provider or "the provider").replace("<", "&lt;")[:64]
    # We do not echo provider error/code text from the URL.
    return HTMLResponse(
        "<!doctype html><html><head><title>Testdeck sign-in</title>"
        "<style>body{font:14px system-ui;margin:48px;color:#1f2937}</style>"
        "</head><body>"
        f"<h1>Testdeck could not connect {safe_provider}.</h1>"
        f"<p>Return to the app to retry. (code: {code})</p>"
        "</body></html>",
        status_code=400,
    )


@router.get("/callback/{provider}")
async def auth_callback(
    provider: str,
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
):
    if error:
        # Provider rejected the request before code exchange.
        return _failure_page(provider, "provider_error")

    result = await identity_service.handle_callback(
        provider=provider, code=code, state=state
    )
    if result.completed:
        return _success_page()
    if result.next_authorize_url:
        return RedirectResponse(url=result.next_authorize_url, status_code=302)
    return _failure_page(provider, result.error or "exchange_failed")


# ---------------------------------------------------------------------------
# Me / refresh / signout
# ---------------------------------------------------------------------------


@router.get("/me")
async def auth_me():
    # Lazy refresh: best-effort, never fail the response if refresh fails.
    try:
        await identity_service.refresh_all()
    except Exception:
        pass
    return identity_service.get_identity_status()


@router.post("/refresh")
async def auth_refresh():
    results = await identity_service.refresh_all()
    return {"refreshed": results}


@router.post("/signout")
async def auth_signout():
    identity_service.sign_out()
    return {"signed_out": True}
