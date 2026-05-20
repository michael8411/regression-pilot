import hmac
import secrets

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = structlog.get_logger("testdeck.security")

LOCAL_AUTH_TOKEN: str = secrets.token_urlsafe(32)

_PUBLIC_EXACT: frozenset[str] = frozenset({"/health"})


def _is_public(method: str, path: str) -> bool:
    if method == "OPTIONS":
        return True
    if path in _PUBLIC_EXACT:
        return True
    # OAuth callback paths are public browser redirects from providers.
    if path.startswith("/auth/callback/"):
        return True
    return False


class LocalAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if _is_public(request.method, request.url.path):
            return await call_next(request)
        token = request.headers.get("X-Testdeck-Auth", "")
        if not hmac.compare_digest(token, LOCAL_AUTH_TOKEN):
            logger.warning(
                "local_auth_rejected",
                path=request.url.path,
                method=request.method,
                token_present=bool(token),
            )
            # Marker header lets the frontend distinguish a backend-auth 401
            # (stale token, just retry with a fresh one) from an upstream 401
            # (provider credential genuinely invalid).
            return JSONResponse(
                {"detail": "unauthorized"},
                status_code=401,
                headers={"X-Testdeck-Auth-Required": "1"},
            )
        return await call_next(request)
