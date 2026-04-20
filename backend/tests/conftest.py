"""Shared fixtures for backend tests."""

from __future__ import annotations

import importlib
import sys

import pytest


class _FakeKeyring:
    """In-memory stand-in for the `keyring` library's public surface.

    Mirrors only what `utils/keyring_store.py` and indirectly the rest of the
    backend use: `get_password`, `set_password`, `delete_password`, plus the
    `errors.PasswordDeleteError` attribute path.
    """

    class errors:  # noqa: N801
        class PasswordDeleteError(Exception):
            pass

    def __init__(self) -> None:
        self._store: dict[tuple[str, str], str] = {}

    def get_password(self, service: str, key: str) -> str | None:
        return self._store.get((service, key))

    def set_password(self, service: str, key: str, value: str) -> None:
        self._store[(service, key)] = value

    def delete_password(self, service: str, key: str) -> None:
        entry = (service, key)
        if entry not in self._store:
            raise self.errors.PasswordDeleteError(f"{service}/{key} not found")
        del self._store[entry]

    def clear(self) -> None:
        self._store.clear()


_fake_keyring_singleton = _FakeKeyring()


_RELOAD_TARGETS: tuple[str, ...] = (
    "utils.keyring_store",
    "utils.crypto",
    "config.settings",
    "services.config_service",
)


def _install_fake_keyring() -> _FakeKeyring:
    """Install the fake, reload downstream modules, reset caches."""
    _fake_keyring_singleton.clear()
    sys.modules["keyring"] = _fake_keyring_singleton  # type: ignore[assignment]

    for name in _RELOAD_TARGETS:
        sys.modules.pop(name, None)
    for name in _RELOAD_TARGETS:
        importlib.import_module(name)

    import utils.crypto as crypto_mod
    crypto_mod._encryptor = None

    from config.settings import get_settings
    get_settings.cache_clear()

    return _fake_keyring_singleton


def _reset_state_after_test() -> None:
    import utils.crypto as crypto_mod
    crypto_mod._encryptor = None
    from config.settings import get_settings
    get_settings.cache_clear()


@pytest.fixture
def fake_keyring():
    """Yield a clean in-memory keyring."""
    fake = _install_fake_keyring()
    yield fake
    _reset_state_after_test()


@pytest.fixture
def fresh_crypto(fake_keyring):
    """Yield `utils.crypto` with a clean fake keyring."""
    import utils.crypto as crypto_mod
    yield crypto_mod
