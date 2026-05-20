import asyncio

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "data_service_test.db"


@pytest.fixture
def data_service(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    import services.data_service as svc
    return svc


def _run(coro):
    return asyncio.run(coro)


class TestExport:

    def test_returns_all_tables(self, data_service):
        out = _run(data_service.export_state())
        assert out["version"] == 1
        assert "exported_at" in out
        for table in data_service._EXPORTED_TABLES:
            assert table in out["tables"]
            assert isinstance(out["tables"][table], list)

    def test_no_api_tokens_in_payload(self, data_service):
        from utils import keyring_store

        keyring_store.set_credential("jira_base_url", "https://example.atlassian.net")
        keyring_store.set_credential("jira_email", "tester@example.com")
        keyring_store.set_credential("jira_api_token", "should-NOT-be-exported")
        keyring_store.set_credential("gemini_api_key", "should-NOT-be-exported")
        keyring_store.set_credential("zephyr_api_token", "should-NOT-be-exported")

        out = _run(data_service.export_state())
        config = out["config"]
        # Whitelisted entries are present.
        assert config["jira_base_url"] == "https://example.atlassian.net"
        assert config["jira_email"] == "tester@example.com"
        # Token keys never even appear in the config dict.
        assert "jira_api_token" not in config
        assert "gemini_api_key" not in config
        assert "zephyr_api_token" not in config

        # And the raw token strings don't sneak in elsewhere.
        import json
        blob = json.dumps(out)
        assert "should-NOT-be-exported" not in blob

    def test_includes_data_rows(self, data_service):
        from schemas.cycle_models import CycleCreate
        import services.cycle_service as cycles

        _run(
            cycles.create_cycle(
                CycleCreate(
                    name="ExportRT",
                    projectKey="FM",
                    ticketKeys=["FM-1"],
                )
            )
        )

        out = _run(data_service.export_state())
        assert len(out["tables"]["test_cycles"]) == 1
        assert out["tables"]["test_cycles"][0]["name"] == "ExportRT"


class TestWipe:

    def test_keeps_credentials_when_requested(self, data_service):
        from utils import keyring_store

        keyring_store.set_credential("jira_api_token", "stays-here")
        # Insert a row to verify it goes away.
        from schemas.cycle_models import CycleCreate
        import services.cycle_service as cycles

        _run(
            cycles.create_cycle(
                CycleCreate(name="X", projectKey="FM", ticketKeys=["FM-1"])
            )
        )

        result = _run(data_service.wipe_state(keep_credentials=True))
        assert result["ok"] is True
        assert result["credentials_cleared"] == 0

        # Tables emptied.
        out = _run(data_service.export_state())
        assert out["tables"]["test_cycles"] == []
        # Credentials kept.
        assert keyring_store.get_credential("jira_api_token") == "stays-here"

    def test_clears_all_credentials_when_requested(self, data_service):
        from utils import keyring_store

        for k, v in [
            ("jira_base_url", "u"),
            ("jira_email", "e"),
            ("jira_api_token", "t"),
            ("gemini_api_key", "g"),
            ("zephyr_base_url", "zu"),
            ("zephyr_api_token", "zt"),
        ]:
            keyring_store.set_credential(k, v)

        result = _run(data_service.wipe_state(keep_credentials=False))
        assert result["ok"] is True
        assert result["credentials_cleared"] == 6

        for k in (
            "jira_base_url",
            "jira_email",
            "jira_api_token",
            "gemini_api_key",
            "zephyr_base_url",
            "zephyr_api_token",
        ):
            assert keyring_store.get_credential(k) is None

    def test_wipe_truncates_all_tables(self, data_service):
        from schemas.cycle_models import CycleCreate
        import services.cycle_service as cycles
        import services.live_board_service as live

        _run(
            cycles.create_cycle(
                CycleCreate(name="A", projectKey="FM", ticketKeys=["FM-1"])
            )
        )
        _run(live.create_board(name="board-A", jql="project = FM"))

        _run(data_service.wipe_state(keep_credentials=True))

        out = _run(data_service.export_state())
        for table in data_service._EXPORTED_TABLES:
            assert out["tables"][table] == []
