"""Tests for settings keyring overlay behavior."""

import pytest


_BASELINE_ENV = {
    "JIRA_BASE_URL": "https://baseline.example/",
    "JIRA_EMAIL": "baseline@example.com",
    "JIRA_API_TOKEN": "env-jira-token",
    "GEMINI_API_KEY": "env-gemini-key",
    "ZEPHYR_BASE_URL": "https://baseline.zephyr/",
    "ZEPHYR_API_TOKEN": "env-zephyr-token",
}


@pytest.fixture
def baseline_env(monkeypatch):
    """Seed a predictable environment baseline for this file."""
    for k, v in _BASELINE_ENV.items():
        monkeypatch.setenv(k, v)
    yield


class TestKeyringOverlayEmpty:

    def test_no_keyring_entries_leaves_env_values(self, fake_keyring, baseline_env):
        from config.settings import Settings

        s = Settings()
        assert s.jira_base_url == "https://baseline.example/"
        assert s.jira_email == "baseline@example.com"
        assert s.jira_api_token == "env-jira-token"
        assert s.gemini_api_key == "env-gemini-key"
        assert s.zephyr_api_token == "env-zephyr-token"


class TestKeyringOverlayApplied:

    def test_keyring_value_overrides_env_for_single_field(self, fake_keyring, baseline_env):
        fake_keyring.set_password("testdeck", "gemini_api_key", "keyring-gemini-key")

        from config.settings import Settings
        s = Settings()

        assert s.gemini_api_key == "keyring-gemini-key"
        assert s.jira_api_token == "env-jira-token"

    def test_all_credential_fields_overlay_when_present(self, fake_keyring, baseline_env):
        overrides = {
            "jira_base_url": "https://keyring.example/",
            "jira_email": "keyring@example.com",
            "jira_api_token": "keyring-jira-token",
            "gemini_api_key": "keyring-gemini-key",
            "zephyr_base_url": "https://keyring.zephyr/",
            "zephyr_api_token": "keyring-zephyr-token",
        }
        for k, v in overrides.items():
            fake_keyring.set_password("testdeck", k, v)

        from config.settings import Settings
        s = Settings()

        assert s.jira_base_url == "https://keyring.example/"
        assert s.jira_email == "keyring@example.com"
        assert s.jira_api_token == "keyring-jira-token"
        assert s.gemini_api_key == "keyring-gemini-key"
        assert s.zephyr_base_url == "https://keyring.zephyr/"
        assert s.zephyr_api_token == "keyring-zephyr-token"

    def test_empty_string_keyring_entry_does_not_overlay(self, fake_keyring, baseline_env):
        """Empty string is falsy — the overlay must leave the env value alone.

        Rationale: an empty-string keyring entry represents "cleared", which
        should fall back to whatever pydantic already loaded, not wipe the
        field to an empty string at the Settings level."""
        fake_keyring.set_password("testdeck", "jira_api_token", "")

        from config.settings import Settings
        s = Settings()

        assert s.jira_api_token == "env-jira-token"

    def test_non_credential_fields_untouched_by_overlay(self, fake_keyring, baseline_env, monkeypatch):
        """backend_port, log_level, app_env, log_to_file are not overlaid."""
        monkeypatch.setenv("BACKEND_PORT", "9999")
        monkeypatch.setenv("LOG_LEVEL", "debug")

        from config.settings import Settings
        s = Settings()

        assert s.backend_port == 9999
        assert s.log_level == "debug"


class TestKeyringFailureFallback:

    def test_keyring_exception_falls_back_to_env(self, baseline_env, monkeypatch):
        """If the keyring backend raises (e.g. GPO-locked Credential Manager)
        the Settings object must still build using the .env / env-var values.
        This is the fix added in Stage 0.5."""
        class _ExplodingKeyring:
            class errors:
                class PasswordDeleteError(Exception):
                    pass

            def get_password(self, service, key):
                raise RuntimeError("Credential Manager unavailable")

            def set_password(self, service, key, value):
                raise RuntimeError("Credential Manager unavailable")

            def delete_password(self, service, key):
                raise RuntimeError("Credential Manager unavailable")

        import sys, importlib
        sys.modules["keyring"] = _ExplodingKeyring()  # type: ignore[assignment]
        for name in ("utils.keyring_store", "config.settings"):
            sys.modules.pop(name, None)
        importlib.import_module("utils.keyring_store")

        from config.settings import Settings
        s = Settings()

        assert s.jira_api_token == "env-jira-token"
        assert s.gemini_api_key == "env-gemini-key"


class TestJiraConfiguredProperty:

    def test_jira_configured_true_when_all_three_present(self, fake_keyring, baseline_env):
        from config.settings import Settings
        s = Settings()
        assert s.jira_configured is True

    def test_jira_configured_false_when_token_missing(self, fake_keyring, baseline_env, monkeypatch):
        monkeypatch.setenv("JIRA_API_TOKEN", "")

        from config.settings import Settings
        s = Settings()

        assert s.jira_configured is False

    def test_jira_configured_false_when_email_missing(self, fake_keyring, baseline_env, monkeypatch):
        monkeypatch.setenv("JIRA_EMAIL", "")

        from config.settings import Settings
        s = Settings()

        assert s.jira_configured is False


class TestGetSettingsCache:

    def test_cache_returns_same_instance(self, fake_keyring, baseline_env):
        from config.settings import get_settings
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2

    def test_cache_clear_forces_reload(self, fake_keyring, baseline_env):
        from config.settings import get_settings
        s1 = get_settings()
        get_settings.cache_clear()
        s2 = get_settings()
        assert s1 is not s2
