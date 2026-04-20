"""Tests for config_service migration and credential helpers."""

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
    for k, v in _BASELINE_ENV.items():
        monkeypatch.setenv(k, v)
    yield


@pytest.fixture
def isolated_env_file(tmp_path, monkeypatch):
    """Point config_service.ENV_PATH at a throwaway file under tmp_path."""
    import services.config_service as svc

    env_file = tmp_path / ".env"
    monkeypatch.setattr(svc, "ENV_PATH", env_file)
    yield env_file


class TestUpdateKeyringCredentials:

    def test_writes_single_field(self, fake_keyring, baseline_env):
        from services.config_service import update_keyring_credentials

        written = update_keyring_credentials({"jira_api_token": "new-token"})

        assert written == ["jira_api_token"]
        assert fake_keyring.get_password("testdeck", "jira_api_token") == "new-token"

    def test_writes_multiple_fields(self, fake_keyring, baseline_env):
        from services.config_service import update_keyring_credentials

        written = update_keyring_credentials(
            {
                "jira_api_token": "tok",
                "gemini_api_key": "gem",
                "zephyr_api_token": "zep",
            }
        )

        assert written == ["gemini_api_key", "jira_api_token", "zephyr_api_token"]
        assert fake_keyring.get_password("testdeck", "gemini_api_key") == "gem"

    def test_ignores_unknown_fields(self, fake_keyring, baseline_env):
        from services.config_service import update_keyring_credentials

        written = update_keyring_credentials(
            {"jira_api_token": "tok", "not_a_credential_field": "x"}
        )

        assert written == ["jira_api_token"]
        assert fake_keyring.get_password("testdeck", "not_a_credential_field") is None

    def test_empty_updates_returns_empty_list(self, fake_keyring, baseline_env):
        from services.config_service import update_keyring_credentials
        assert update_keyring_credentials({}) == []

    def test_clears_get_settings_cache(self, fake_keyring, baseline_env):
        from config.settings import get_settings
        from services.config_service import update_keyring_credentials

        s_before = get_settings()
        assert s_before.gemini_api_key == "env-gemini-key"

        update_keyring_credentials({"gemini_api_key": "fresh-gemini"})

        s_after = get_settings()
        assert s_after is not s_before
        assert s_after.gemini_api_key == "fresh-gemini"


class TestMigrateEnvToKeyringFirstRun:

    def test_migrates_env_values_to_keyring(self, fake_keyring, baseline_env, isolated_env_file):
        isolated_env_file.write_text(
            "JIRA_API_TOKEN=env-jira-token\n"
            "GEMINI_API_KEY=env-gemini-key\n"
        )
        from services.config_service import migrate_env_to_keyring

        migrated = migrate_env_to_keyring()

        assert migrated is True
        assert fake_keyring.get_password("testdeck", "jira_api_token") == "env-jira-token"
        assert fake_keyring.get_password("testdeck", "gemini_api_key") == "env-gemini-key"

    def test_clears_migrated_values_in_env_file(
        self, fake_keyring, baseline_env, isolated_env_file
    ):
        isolated_env_file.write_text(
            "JIRA_API_TOKEN=env-jira-token\n"
            "GEMINI_API_KEY=env-gemini-key\n"
            "UNRELATED_VAR=keep-me\n"
        )
        from services.config_service import migrate_env_to_keyring

        migrate_env_to_keyring()

        after = isolated_env_file.read_text()
        assert "JIRA_API_TOKEN=env-jira-token" not in after
        assert "GEMINI_API_KEY=env-gemini-key" not in after
        assert "UNRELATED_VAR=keep-me" in after

    def test_preserves_comments_and_blank_lines(
        self, fake_keyring, baseline_env, isolated_env_file
    ):
        original = (
            "# This is a comment\n"
            "\n"
            "JIRA_API_TOKEN=env-jira-token\n"
            "\n"
            "# Another comment\n"
            "GEMINI_API_KEY=env-gemini-key\n"
        )
        isolated_env_file.write_text(original)
        from services.config_service import migrate_env_to_keyring

        migrate_env_to_keyring()

        after = isolated_env_file.read_text()
        assert "# This is a comment" in after
        assert "# Another comment" in after
        assert "JIRA_API_TOKEN=" in after
        assert "env-jira-token" not in after


class TestMigrateEnvToKeyringIdempotency:

    def test_second_call_returns_false(self, fake_keyring, baseline_env, isolated_env_file):
        isolated_env_file.write_text("JIRA_API_TOKEN=env-jira-token\n")
        from services.config_service import migrate_env_to_keyring

        first = migrate_env_to_keyring()
        second = migrate_env_to_keyring()

        assert first is True
        assert second is False

    def test_existing_keyring_values_not_overwritten(
        self, fake_keyring, baseline_env, isolated_env_file
    ):
        """Pre-seed every credential slot in keyring; no env value should migrate
        on top. migrate_env_to_keyring() returns False because nothing needed
        doing, and every pre-existing keyring entry is preserved verbatim."""
        pre_existing = {
            "jira_base_url": "PRE_URL",
            "jira_email": "pre@example.com",
            "jira_api_token": "PRE_TOKEN",
            "gemini_api_key": "PRE_GEM",
            "zephyr_base_url": "PRE_ZURL",
            "zephyr_api_token": "PRE_ZTOKEN",
        }
        for k, v in pre_existing.items():
            fake_keyring.set_password("testdeck", k, v)

        isolated_env_file.write_text("JIRA_API_TOKEN=env-jira-token\n")

        from services.config_service import migrate_env_to_keyring

        migrated = migrate_env_to_keyring()

        assert migrated is False
        for k, v in pre_existing.items():
            assert fake_keyring.get_password("testdeck", k) == v
        assert "JIRA_API_TOKEN=env-jira-token" in isolated_env_file.read_text()

    def test_single_preexisting_value_preserved_while_others_migrate(
        self, fake_keyring, baseline_env, isolated_env_file
    ):
        """Mixed case: one keyring slot is pre-seeded, others are empty. Only
        the unseeded slots migrate from env; the pre-seeded one is untouched."""
        fake_keyring.set_password("testdeck", "jira_api_token", "PRE_TOKEN")
        isolated_env_file.write_text(
            "JIRA_API_TOKEN=env-jira-token\n"
            "GEMINI_API_KEY=env-gemini-key\n"
        )

        from services.config_service import migrate_env_to_keyring

        migrated = migrate_env_to_keyring()

        assert migrated is True
        assert fake_keyring.get_password("testdeck", "jira_api_token") == "PRE_TOKEN"
        assert fake_keyring.get_password("testdeck", "gemini_api_key") == "env-gemini-key"
        after = isolated_env_file.read_text()
        assert "JIRA_API_TOKEN=env-jira-token" in after
        assert "GEMINI_API_KEY=env-gemini-key" not in after

    def test_skips_empty_env_fields(self, fake_keyring, monkeypatch, isolated_env_file):
        """Empty env values must not be migrated — they're not credentials."""
        for k in _BASELINE_ENV:
            monkeypatch.setenv(k, "")

        isolated_env_file.write_text("")

        from services.config_service import migrate_env_to_keyring

        migrated = migrate_env_to_keyring()

        assert migrated is False
        assert fake_keyring.get_password("testdeck", "jira_api_token") is None

    def test_no_env_file_does_not_raise(self, fake_keyring, monkeypatch, isolated_env_file):
        """If backend/.env does not exist, migration is a no-op clearing step."""
        assert not isolated_env_file.exists()
        for k in _BASELINE_ENV:
            monkeypatch.setenv(k, "")

        from services.config_service import migrate_env_to_keyring

        assert migrate_env_to_keyring() is False


class TestClearEnvKeys:

    def test_clears_existing_key(self, isolated_env_file):
        isolated_env_file.write_text("JIRA_API_TOKEN=secret\n")
        from services.config_service import _clear_env_keys

        _clear_env_keys(["JIRA_API_TOKEN"])

        assert isolated_env_file.read_text() == "JIRA_API_TOKEN=\n"

    def test_clears_multiple_keys(self, isolated_env_file):
        isolated_env_file.write_text(
            "JIRA_API_TOKEN=s1\nGEMINI_API_KEY=s2\nOTHER=keep\n"
        )
        from services.config_service import _clear_env_keys

        _clear_env_keys(["JIRA_API_TOKEN", "GEMINI_API_KEY"])

        after = isolated_env_file.read_text()
        assert "JIRA_API_TOKEN=\n" in after
        assert "GEMINI_API_KEY=\n" in after
        assert "OTHER=keep" in after

    def test_missing_file_is_noop(self, isolated_env_file):
        """If .env doesn't exist there's nothing to clear — don't crash."""
        assert not isolated_env_file.exists()
        from services.config_service import _clear_env_keys
        _clear_env_keys(["JIRA_API_TOKEN"])  # must not raise
        assert not isolated_env_file.exists()

    def test_partial_key_match_not_affected(self, isolated_env_file):
        """A key name that is a substring of another must not accidentally match."""
        isolated_env_file.write_text(
            "JIRA_API_TOKEN=secret\n"
            "JIRA_API_TOKEN_BACKUP=also-secret\n"
        )
        from services.config_service import _clear_env_keys

        _clear_env_keys(["JIRA_API_TOKEN"])

        after = isolated_env_file.read_text()
        assert "JIRA_API_TOKEN=\n" in after
        assert "JIRA_API_TOKEN_BACKUP=also-secret" in after
