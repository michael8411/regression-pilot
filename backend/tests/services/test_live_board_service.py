import asyncio
import json

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "live_boards_test.db"


@pytest.fixture
def live_service(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    import services.live_board_service as svc
    return svc


def _run(coro):
    return asyncio.run(coro)


class TestCreateBoard:

    def test_default_columns(self, live_service):
        board = _run(live_service.create_board(name="FM in QA", jql="project = FM"))
        assert board["name"] == "FM in QA"
        assert board["columns"] == live_service.DEFAULT_COLUMNS
        assert board["pinned"] is False
        assert board["jql"] == "project = FM"
        assert board["id"]

    def test_custom_columns(self, live_service):
        cols = ["Triage", "Spec", "Build", "QA", "Done"]
        board = _run(live_service.create_board(name="A", jql="x", columns=cols))
        assert board["columns"] == cols

    def test_rejects_secret_in_name(self, live_service):
        with pytest.raises(ValueError, match="secret"):
            _run(
                live_service.create_board(
                    name="AccountKey=" + "A" * 86 + "==",
                    jql="project = FM",
                )
            )

    def test_rejects_empty_name(self, live_service):
        with pytest.raises(ValueError):
            _run(live_service.create_board(name="   ", jql="project = FM"))

    def test_long_name_truncated(self, live_service):
        board = _run(live_service.create_board(name="x" * 500, jql="x"))
        assert len(board["name"]) <= 120


class TestRoundTrip:

    def test_jql_round_trip_through_encryption(self, live_service):
        board = _run(
            live_service.create_board(
                name="A", jql="project = FM AND assignee = currentUser()"
            )
        )
        fetched = _run(live_service.get_board(board["id"]))
        assert fetched["jql"] == "project = FM AND assignee = currentUser()"

    def test_get_unknown_board(self, live_service):
        assert _run(live_service.get_board("nope")) is None


class TestList:

    def test_orders_pinned_first(self, live_service):
        a = _run(live_service.create_board(name="alpha", jql="x"))
        b = _run(live_service.create_board(name="beta", jql="y"))
        _run(live_service.update_board(b["id"], pinned=True))
        listed = _run(live_service.list_boards())
        assert listed[0]["id"] == b["id"]
        assert listed[1]["id"] == a["id"]

    def test_empty(self, live_service):
        assert _run(live_service.list_boards()) == []


class TestUpdate:

    def test_partial_fields(self, live_service):
        board = _run(live_service.create_board(name="A", jql="x"))
        updated = _run(live_service.update_board(board["id"], name="B"))
        assert updated["name"] == "B"
        assert updated["jql"] == "x"

    def test_re_encrypts_jql(self, live_service):
        board = _run(live_service.create_board(name="A", jql="x"))
        _run(live_service.update_board(board["id"], jql="y"))
        fetched = _run(live_service.get_board(board["id"]))
        assert fetched["jql"] == "y"

    def test_rejects_secret_in_name_on_update(self, live_service):
        board = _run(live_service.create_board(name="A", jql="x"))
        with pytest.raises(ValueError, match="secret"):
            _run(
                live_service.update_board(
                    board["id"], name="AccountKey=" + "B" * 86 + "=="
                )
            )

    def test_unknown_id_returns_none(self, live_service):
        out = _run(live_service.update_board("nope", name="X"))
        assert out is None

    def test_pinned_round_trip(self, live_service):
        board = _run(live_service.create_board(name="A", jql="x"))
        out = _run(live_service.update_board(board["id"], pinned=True))
        assert out["pinned"] is True
        out = _run(live_service.update_board(board["id"], pinned=False))
        assert out["pinned"] is False

    def test_columns_update(self, live_service):
        board = _run(live_service.create_board(name="A", jql="x"))
        out = _run(
            live_service.update_board(board["id"], columns=["Q", "Done"])
        )
        assert out["columns"] == ["Q", "Done"]


class TestDelete:

    def test_delete_board(self, live_service):
        board = _run(live_service.create_board(name="A", jql="x"))
        assert _run(live_service.delete_board(board["id"])) is True
        assert _run(live_service.get_board(board["id"])) is None

    def test_delete_unknown_returns_false(self, live_service):
        assert _run(live_service.delete_board("nope")) is False


class TestSummarizeBoardScope:

    def test_empty_summary(self, live_service):
        s = live_service.summarize_board_scope([])
        assert s == {"total": 0, "distinct_epics": 0, "distinct_components": 0}

    def test_single_epic(self, live_service):
        tickets = [
            {"epic_key": "FM-1", "component_name": "Mobile"},
            {"epic_key": "FM-1", "component_name": "Mobile"},
            {"epic_key": "FM-1", "component_name": None},
        ]
        s = live_service.summarize_board_scope(tickets)
        assert s == {
            "total": 3,
            "distinct_epics": 1,
            "distinct_components": 1,
        }

    def test_multi_epic_multi_component(self, live_service):
        tickets = [
            {"epic_key": "FM-1", "component_name": "Mobile"},
            {"epic_key": "FM-2", "component_name": "Telematics"},
            {"epic_key": "FM-3", "component_name": "Mobile"},
        ]
        s = live_service.summarize_board_scope(tickets)
        assert s == {
            "total": 3,
            "distinct_epics": 3,
            "distinct_components": 2,
        }


class TestExtractLaneKeys:

    def test_epic_from_epic_field(self, live_service, monkeypatch):
        from services import jira_service

        issue = {
            "fields": {
                "customfield_10014": "FM-100",
                "components": [{"name": "Mobile"}],
            }
        }
        out = jira_service._extract_lane_keys(issue)
        assert out["epic_key"] == "FM-100"
        assert out["parent_key"] is None
        assert out["component_name"] == "Mobile"

    def test_epic_falls_back_to_epic_parent(self, live_service):
        from services import jira_service

        issue = {
            "fields": {
                "customfield_10014": None,
                "parent": {
                    "key": "FM-50",
                    "fields": {"issuetype": {"name": "Epic"}},
                },
            }
        }
        out = jira_service._extract_lane_keys(issue)
        assert out["epic_key"] == "FM-50"
        assert out["parent_key"] == "FM-50"

    def test_non_epic_parent_does_not_promote(self, live_service):
        from services import jira_service

        issue = {
            "fields": {
                "parent": {
                    "key": "FM-50",
                    "fields": {"issuetype": {"name": "Story"}},
                },
            }
        }
        out = jira_service._extract_lane_keys(issue)
        assert out["epic_key"] is None
        assert out["parent_key"] == "FM-50"

    def test_no_parent_no_components(self, live_service):
        from services import jira_service

        out = jira_service._extract_lane_keys({"fields": {}})
        assert out == {
            "epic_key": None,
            "parent_key": None,
            "component_name": None,
        }

    def test_multiple_components_uses_first(self, live_service):
        from services import jira_service

        issue = {
            "fields": {
                "components": [
                    {"name": "Telematics"},
                    {"name": "Mobile"},
                ]
            }
        }
        out = jira_service._extract_lane_keys(issue)
        assert out["component_name"] == "Telematics"

    def test_custom_epic_field_via_setting(
        self, live_service, monkeypatch
    ):
        from services import jira_service

        monkeypatch.setattr(
            jira_service, "_epic_field_name", lambda: "customfield_99999"
        )

        issue = {
            "fields": {
                "customfield_99999": "ALT-1",
                "customfield_10014": "STALE-1",
            }
        }
        out = jira_service._extract_lane_keys(issue)
        assert out["epic_key"] == "ALT-1"


class TestCorruption:

    def test_corrupted_jql_returns_empty_string(self, live_service):
        board = _run(live_service.create_board(name="A", jql="x"))

        async def corrupt():
            from db.connection import get_connection
            async with get_connection() as db:
                await db.execute(
                    "UPDATE live_boards SET jql = ? WHERE id = ?",
                    ("not-a-fernet-token", board["id"]),
                )
                await db.commit()

        _run(corrupt())
        fetched = _run(live_service.get_board(board["id"]))
        assert fetched is not None
        assert fetched["jql"] == ""

    def test_corrupted_columns_falls_back_to_default(self, live_service):
        board = _run(live_service.create_board(name="A", jql="x"))

        async def corrupt():
            from db.connection import get_connection
            async with get_connection() as db:
                await db.execute(
                    "UPDATE live_boards SET columns = ? WHERE id = ?",
                    ("not-json", board["id"]),
                )
                await db.commit()

        _run(corrupt())
        fetched = _run(live_service.get_board(board["id"]))
        assert fetched["columns"] == live_service.DEFAULT_COLUMNS
