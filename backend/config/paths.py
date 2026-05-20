from pathlib import Path
import os
import sys

APP_NAME = "Testdeck"


def app_data_dir() -> Path:
    """Return the platform app data directory, or TESTDECK_DATA_DIR if set."""
    override = os.getenv("TESTDECK_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    if sys.platform == "win32":
        root = os.getenv("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(root) / APP_NAME
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    xdg = os.getenv("XDG_CONFIG_HOME")
    if xdg:
        return Path(xdg) / "testdeck"
    return Path.home() / ".config" / "testdeck"


def ensure_app_data_dir() -> Path:
    path = app_data_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path


def db_path() -> Path:
    return ensure_app_data_dir() / "testdeck.db"


def preferences_path() -> Path:
    return ensure_app_data_dir() / "preferences.json"


def runtime_dir() -> Path:
    path = ensure_app_data_dir() / "runtime"
    path.mkdir(parents=True, exist_ok=True)
    return path
