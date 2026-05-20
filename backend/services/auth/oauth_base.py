"""Shared OAuth helpers (Phase 17).

PKCE, state, redirect URI helpers, and a small `OAuthTokenSet` value
type that provider modules return. Keep this small: provider quirks
live in the provider modules.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

import structlog

logger = structlog.get_logger("testdeck.auth.oauth_base")


# Treat tokens expiring within this window as expired so refresh runs early.
EXPIRY_SKEW_SECONDS = 300
DEFAULT_TOKEN_LIFETIME_SECONDS = 3600
PENDING_FLOW_TTL_SECONDS = 600


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def generate_code_verifier(byte_length: int = 64) -> str:
    """RFC 7636: 43-128 char URL-safe ASCII. 64 bytes -> ~86 chars."""
    return _b64url(secrets.token_bytes(byte_length))


def derive_code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return _b64url(digest)


def generate_state(provider: str, flow_id: str) -> str:
    """State carries provider + flow + a fresh nonce. Validation happens
    against server-stored state, not by parsing the value."""
    nonce = secrets.token_urlsafe(16)
    return f"{provider}.{flow_id}.{nonce}"


def parse_state_provider(state: str) -> Optional[str]:
    if not state or "." not in state:
        return None
    return state.split(".", 1)[0]


@dataclass
class OAuthTokenSet:
    access_token: str
    refresh_token: str = ""
    expires_at: int = 0
    scope: str = ""
    token_type: str = "Bearer"
    extra: dict = field(default_factory=dict)

    @property
    def is_expired(self) -> bool:
        if not self.expires_at:
            return False
        return int(time.time()) + EXPIRY_SKEW_SECONDS >= int(self.expires_at)

    @property
    def fingerprint(self) -> str:
        """Non-reversible identifier for logs."""
        if not self.access_token:
            return ""
        return f"len{len(self.access_token)}#{hash(self.access_token) & 0xFFFF:04x}"


def expires_at_from_now(expires_in: Optional[int]) -> int:
    if not expires_in or expires_in <= 0:
        return int(time.time()) + DEFAULT_TOKEN_LIFETIME_SECONDS
    return int(time.time()) + int(expires_in)


def build_redirect_uri(redirect_base_url: str, provider: str) -> str:
    base = (redirect_base_url or "http://127.0.0.1:8000").rstrip("/")
    return f"{base}/auth/callback/{provider}"


def redact_error(text: str, *, cap: int = 200) -> str:
    """Trim provider error text for safe logs. Never includes tokens because
    callers only feed already-token-stripped strings here."""
    if not text:
        return ""
    snippet = text.strip().replace("\n", " ")
    return snippet[:cap]


def is_flow_expired(created_at: int) -> bool:
    return int(time.time()) - int(created_at) > PENDING_FLOW_TTL_SECONDS
