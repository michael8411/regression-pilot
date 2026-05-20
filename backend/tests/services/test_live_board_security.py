import asyncio
import json
import logging

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "live_boards_security_test.db"


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


class TestEncryptionAtRest:

    def test_jql_encrypted_at_rest(self, live_service):
        board = _run(
            live_service.create_board(
                name="A",
                jql='project = FM AND text ~ "sensitive search"',
            )
        )

        async def read_raw():
            from db.connection import get_connection
            async with get_connection() as db:
                cursor = await db.execute(
                    "SELECT jql FROM live_boards WHERE id = ?", (board["id"],)
                )
                return await cursor.fetchone()

        row = _run(read_raw())
        raw = row["jql"]
        assert raw.startswith("gAAAAAB")
        assert "sensitive" not in raw
        with pytest.raises(json.JSONDecodeError):
            json.loads(raw)


class TestCorruptionResilience:

    def test_corrupted_board_does_not_500(self, live_service):
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


class TestLogHygiene:

    def test_logs_do_not_contain_jql(self, live_service, caplog):
        sensitive_jql = 'project = HQ AND text ~ "sensitive incident search"'
        with caplog.at_level(logging.DEBUG):
            _run(live_service.create_board(name="A", jql=sensitive_jql))

        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        assert "sensitive incident search" not in joined

    def test_secret_in_name_not_logged_verbatim(self, live_service, caplog):
        leaky = "AccountKey=" + "Z" * 86 + "=="
        with caplog.at_level(logging.DEBUG):
            with pytest.raises(ValueError):
                _run(live_service.create_board(name=leaky, jql="x"))

        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        assert leaky not in joined
