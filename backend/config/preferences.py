import copy
import json
from pathlib import Path


DEFAULT_PREFERENCES = {
    "theme": "dark",
    "project_scope": [],
    "default_version_status": "unreleased",
    "auto_select_tickets": True,
    "default_zephyr_folder": None,
    "ai_model": "gemini-2.5-flash",
    "ai_temperature": 0.3,
    "export_format": "json",
}

PREFERENCES_PATH = Path(__file__).resolve().parent.parent / "preferences.json"


def read_preferences(path: Path = PREFERENCES_PATH) -> dict:
    defaults = copy.deepcopy(DEFAULT_PREFERENCES)
    try:
        if path.exists():
            with open(path, encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                defaults.update(saved)
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    return defaults
