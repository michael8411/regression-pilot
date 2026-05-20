"""Tests for backend/config/paths.py — app data directory resolution and migration."""

import shutil
import sys
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

class TestAppDataDir:

    def test_override_env_honored(self, tmp_path, monkeypatch):
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(tmp_path / "custom"))
        import config.paths as paths_mod
        result = paths_mod.app_data_dir()
        assert result == (tmp_path / "custom").resolve()

    def test_ensure_app_data_dir_creates_directory(self, tmp_path, monkeypatch):
        target = tmp_path / "data"
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(target))
        import config.paths as paths_mod
        created = paths_mod.ensure_app_data_dir()
        assert created.is_dir()

    def test_db_path_under_data_dir(self, tmp_path, monkeypatch):
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(tmp_path))
        import config.paths as paths_mod
        assert paths_mod.db_path() == (tmp_path.resolve() / "testdeck.db")

    def test_preferences_path_under_data_dir(self, tmp_path, monkeypatch):
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(tmp_path))
        import config.paths as paths_mod
        assert paths_mod.preferences_path() == (tmp_path.resolve() / "preferences.json")

    def test_runtime_dir_created(self, tmp_path, monkeypatch):
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(tmp_path))
        import config.paths as paths_mod
        rt = paths_mod.runtime_dir()
        assert rt.is_dir()
        assert rt.name == "runtime"

    def test_windows_path_uses_appdata(self, tmp_path, monkeypatch):
        monkeypatch.delenv("TESTDECK_DATA_DIR", raising=False)
        monkeypatch.setenv("APPDATA", str(tmp_path))
        monkeypatch.setattr(sys, "platform", "win32")
        import config.paths as paths_mod
        result = paths_mod.app_data_dir()
        assert result == tmp_path / "Testdeck"

    def test_linux_path_uses_xdg_config_home(self, tmp_path, monkeypatch):
        monkeypatch.delenv("TESTDECK_DATA_DIR", raising=False)
        monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "xdg"))
        monkeypatch.setattr(sys, "platform", "linux")
        import config.paths as paths_mod
        result = paths_mod.app_data_dir()
        assert result == tmp_path / "xdg" / "testdeck"


# ---------------------------------------------------------------------------
# DB migration helper (mirrors _migrate_legacy_data_files in main.py)
# ---------------------------------------------------------------------------

def _run_migration(backend_dir: Path, data_dir: Path) -> None:
    """Reproduce migration logic for isolated unit testing."""
    import config.paths as paths_mod
    old_db = backend_dir / "testdeck.db"
    new_db = paths_mod.db_path()
    if old_db.exists() and not new_db.exists():
        shutil.copy2(old_db, new_db)
    old_prefs = backend_dir / "preferences.json"
    new_prefs = paths_mod.preferences_path()
    if old_prefs.exists() and not new_prefs.exists():
        shutil.copy2(old_prefs, new_prefs)


class TestDbMigration:

    def test_old_db_copied_to_app_data(self, tmp_path, monkeypatch):
        backend_dir = tmp_path / "backend"
        backend_dir.mkdir()
        data_dir = tmp_path / "data"
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(data_dir))

        old_db = backend_dir / "testdeck.db"
        old_db.write_bytes(b"SQLite\x00fake")

        import config.paths as paths_mod
        _run_migration(backend_dir, data_dir)

        assert paths_mod.db_path().exists()
        assert paths_mod.db_path().read_bytes() == b"SQLite\x00fake"

    def test_old_db_not_overwritten_when_new_exists(self, tmp_path, monkeypatch):
        backend_dir = tmp_path / "backend"
        backend_dir.mkdir()
        data_dir = tmp_path / "data"
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(data_dir))

        import config.paths as paths_mod
        new_db = paths_mod.db_path()
        new_db.write_bytes(b"existing")
        (backend_dir / "testdeck.db").write_bytes(b"old")

        _run_migration(backend_dir, data_dir)

        assert new_db.read_bytes() == b"existing"

    def test_preferences_copied_to_app_data(self, tmp_path, monkeypatch):
        backend_dir = tmp_path / "backend"
        backend_dir.mkdir()
        data_dir = tmp_path / "data"
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(data_dir))

        (backend_dir / "preferences.json").write_text('{"theme": "light"}', encoding="utf-8")

        import config.paths as paths_mod
        _run_migration(backend_dir, data_dir)

        assert paths_mod.preferences_path().read_text(encoding="utf-8") == '{"theme": "light"}'

    def test_preferences_not_overwritten_when_new_exists(self, tmp_path, monkeypatch):
        backend_dir = tmp_path / "backend"
        backend_dir.mkdir()
        data_dir = tmp_path / "data"
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(data_dir))

        import config.paths as paths_mod
        new_prefs = paths_mod.preferences_path()
        new_prefs.write_text('{"theme": "dark"}', encoding="utf-8")
        (backend_dir / "preferences.json").write_text('{"theme": "light"}', encoding="utf-8")

        _run_migration(backend_dir, data_dir)

        assert new_prefs.read_text(encoding="utf-8") == '{"theme": "dark"}'

    def test_no_old_files_no_error(self, tmp_path, monkeypatch):
        backend_dir = tmp_path / "backend"
        backend_dir.mkdir()
        data_dir = tmp_path / "data"
        monkeypatch.setenv("TESTDECK_DATA_DIR", str(data_dir))
        # Should not raise even if there are no old files to migrate.
        _run_migration(backend_dir, data_dir)
