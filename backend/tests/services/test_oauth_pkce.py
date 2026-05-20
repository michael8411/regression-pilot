"""Phase 17 — PKCE and state helpers."""

import base64
import hashlib

import pytest


def test_code_verifier_is_unique_and_long_enough():
    from services.auth.oauth_base import generate_code_verifier

    a = generate_code_verifier()
    b = generate_code_verifier()
    assert a != b
    # 64 random bytes → ~86 base64url chars, well above the 43-char minimum.
    assert 43 <= len(a) <= 128
    assert "=" not in a and "+" not in a and "/" not in a


def test_code_challenge_is_sha256_b64url_of_verifier():
    from services.auth.oauth_base import (
        derive_code_challenge,
        generate_code_verifier,
    )

    v = generate_code_verifier()
    c = derive_code_challenge(v)
    expected = base64.urlsafe_b64encode(
        hashlib.sha256(v.encode("ascii")).digest()
    ).decode("ascii").rstrip("=")
    assert c == expected


def test_state_carries_provider_prefix():
    from services.auth.oauth_base import generate_state, parse_state_provider

    s = generate_state("github", "flow123")
    assert parse_state_provider(s) == "github"
    assert "flow123" in s


def test_state_nonce_is_random():
    from services.auth.oauth_base import generate_state

    a = generate_state("github", "flow123")
    b = generate_state("github", "flow123")
    assert a != b


def test_build_redirect_uri_strips_trailing_slash():
    from services.auth.oauth_base import build_redirect_uri

    assert (
        build_redirect_uri("http://127.0.0.1:8000/", "entra")
        == "http://127.0.0.1:8000/auth/callback/entra"
    )


def test_token_set_is_expired_when_within_skew():
    import time

    from services.auth.oauth_base import EXPIRY_SKEW_SECONDS, OAuthTokenSet

    fresh = OAuthTokenSet(access_token="x", expires_at=int(time.time()) + 3600)
    near = OAuthTokenSet(
        access_token="x",
        expires_at=int(time.time()) + EXPIRY_SKEW_SECONDS - 1,
    )
    assert fresh.is_expired is False
    assert near.is_expired is True


def test_redact_error_trims_and_collapses_newlines():
    from services.auth.oauth_base import redact_error

    out = redact_error("bad\nrequest with\nbody", cap=12)
    assert "\n" not in out
    assert len(out) <= 12
