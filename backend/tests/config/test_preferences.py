"""Tests for preferences read/write helpers."""

import json

import pytest

from config.preferences import (
    DEFAULT_PREFERENCES,
    read_preferences,
    write_preferences,
)


class TestReadPreferences:

    def test_missing_file_returns_defaults(self, tmp_path):
        missing = tmp_path / "does_not_exist.json"
        result = read_preferences(missing)
        assert result == DEFAULT_PREFERENCES
        result["theme"] = "MUTATED"
        assert DEFAULT_PREFERENCES["theme"] == "dark"

    def test_saved_values_merge_onto_defaults(self, tmp_path):
        prefs_file = tmp_path / "prefs.json"
        prefs_file.write_text(json.dumps({"theme": "light", "ai_temperature": 0.7}))

        result = read_preferences(prefs_file)
        assert result["theme"] == "light"
        assert result["ai_temperature"] == 0.7
        assert result["ai_model"] == DEFAULT_PREFERENCES["ai_model"]
        assert result["export_format"] == DEFAULT_PREFERENCES["export_format"]

    def test_corrupt_json_returns_defaults(self, tmp_path):
        """Malformed JSON must not crash the backend — degrade to defaults."""
        prefs_file = tmp_path / "prefs.json"
        prefs_file.write_text("{not valid json")
        assert read_preferences(prefs_file) == DEFAULT_PREFERENCES

    def test_non_dict_json_returns_defaults(self, tmp_path):
        """A JSON array / string / number at the top level is ignored."""
        prefs_file = tmp_path / "prefs.json"
        prefs_file.write_text(json.dumps(["not", "a", "dict"]))
        assert read_preferences(prefs_file) == DEFAULT_PREFERENCES

    def test_empty_object_returns_defaults(self, tmp_path):
        prefs_file = tmp_path / "prefs.json"
        prefs_file.write_text("{}")
        assert read_preferences(prefs_file) == DEFAULT_PREFERENCES


class TestWritePreferences:

    def test_writes_and_persists_values(self, tmp_path):
        prefs_file = tmp_path / "prefs.json"
        result = write_preferences({"theme": "light"}, path=prefs_file)

        assert result["theme"] == "light"
        assert prefs_file.exists()
        on_disk = json.loads(prefs_file.read_text())
        assert on_disk["theme"] == "light"

    def test_merges_onto_existing_values(self, tmp_path):
        prefs_file = tmp_path / "prefs.json"
        prefs_file.write_text(json.dumps({"theme": "light", "ai_temperature": 0.8}))

        result = write_preferences({"theme": "dark"}, path=prefs_file)

        assert result["theme"] == "dark"
        assert result["ai_temperature"] == 0.8

    def test_none_values_are_filtered_out(self, tmp_path):
        prefs_file = tmp_path / "prefs.json"
        prefs_file.write_text(json.dumps({"theme": "light"}))

        result = write_preferences({"theme": None, "ai_model": "gemini-x"}, path=prefs_file)

        assert result["theme"] == "light"
        assert result["ai_model"] == "gemini-x"

    def test_creates_parent_directory_if_missing(self, tmp_path):
        prefs_file = tmp_path / "nested" / "subdir" / "prefs.json"
        assert not prefs_file.parent.exists()

        write_preferences({"theme": "light"}, path=prefs_file)

        assert prefs_file.exists()

    def test_writes_utf8_non_ascii_values(self, tmp_path):
        prefs_file = tmp_path / "prefs.json"
        write_preferences({"ai_model": "日本語モデル"}, path=prefs_file)
        result = read_preferences(prefs_file)
        assert result["ai_model"] == "日本語モデル"


class TestDefaultsContract:
    """These defaults are referenced from plan.md and the frontend ThemeContext.
    Changing them is a breaking change — these tests alert us if someone edits
    the dict in config/preferences.py without updating the plan."""

    @pytest.mark.parametrize(
        "key, expected",
        [
            ("theme", "dark"),
            ("default_version_status", "unreleased"),
            ("auto_select_tickets", True),
            ("ai_model", "gemini-2.5-flash"),
            ("ai_temperature", 0.3),
            ("export_format", "json"),
        ],
    )
    def test_default_value(self, key, expected):
        assert DEFAULT_PREFERENCES[key] == expected

    def test_project_scope_default_is_empty_list(self):
        assert DEFAULT_PREFERENCES["project_scope"] == []

    def test_default_zephyr_folder_is_none(self):
        assert DEFAULT_PREFERENCES["default_zephyr_folder"] is None
