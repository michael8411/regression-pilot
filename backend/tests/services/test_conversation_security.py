import asyncio
import json
import logging

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "conversations_security_test.db"


@pytest.fixture
def conversation_service(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    import services.conversation_service as svc
    return svc


def _run(coro):
    return asyncio.run(coro)


async def _read_message_content(conversation_id):
    from db.connection import get_connection
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT content FROM messages WHERE conversation_id = ?",
            (conversation_id,),
        )
        return [row["content"] for row in await cursor.fetchall()]


async def _read_attachment_ref(conversation_id):
    from db.connection import get_connection
    async with get_connection() as db:
        cursor = await db.execute(
            "SELECT ref FROM attachments WHERE conversation_id = ?",
            (conversation_id,),
        )
        return [row["ref"] for row in await cursor.fetchall()]


class TestEncryptionAtRest:

    def test_message_content_encrypted(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        _run(
            conversation_service.append_message(
                convo["id"],
                role="user",
                content="extremely sensitive customer data",
            )
        )
        rows = _run(_read_message_content(convo["id"]))
        assert len(rows) == 1
        raw = rows[0]
        assert raw.startswith("gAAAAAB")
        assert "extremely sensitive" not in raw
        with pytest.raises(json.JSONDecodeError):
            json.loads(raw)

    def test_attachment_ref_encrypted(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        _run(
            conversation_service.add_attachment(
                convo["id"], kind="ticket", ref="FM-9999"
            )
        )
        rows = _run(_read_attachment_ref(convo["id"]))
        assert rows[0].startswith("gAAAAAB")
        assert "FM-9999" not in rows[0]


class TestCorruptionResilience:

    def test_corrupted_message_returns_placeholder(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        msg, _ = _run(
            conversation_service.append_message(
                convo["id"], role="user", content="hi"
            )
        )

        async def corrupt():
            from db.connection import get_connection
            async with get_connection() as db:
                await db.execute(
                    "UPDATE messages SET content = ? WHERE id = ?",
                    ("not-a-fernet-token", msg["id"]),
                )
                await db.commit()

        _run(corrupt())

        full = _run(conversation_service.get_conversation(convo["id"]))
        assert full is not None
        assert full["messages"][0]["content"] == "[unreadable]"

    def test_corrupted_attachment_returns_empty_string(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        att = _run(
            conversation_service.add_attachment(
                convo["id"], kind="ticket", ref="FM-1"
            )
        )

        async def corrupt():
            from db.connection import get_connection
            async with get_connection() as db:
                await db.execute(
                    "UPDATE attachments SET ref = ? WHERE id = ?",
                    ("not-a-fernet-token", att["id"]),
                )
                await db.commit()

        _run(corrupt())

        full = _run(conversation_service.get_conversation(convo["id"]))
        assert full is not None
        assert full["attachments"][0]["ref"] == ""


class TestLogHygiene:

    def test_logs_do_not_contain_message_content(
        self, conversation_service, caplog
    ):
        sensitive = "extremely sensitive customer data"
        with caplog.at_level(logging.DEBUG):
            convo = _run(conversation_service.create_conversation())
            _run(
                conversation_service.append_message(
                    convo["id"], role="user", content=sensitive
                )
            )

        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        assert sensitive not in joined

    def test_logs_do_not_contain_attachment_ref(
        self, conversation_service, caplog
    ):
        with caplog.at_level(logging.DEBUG):
            convo = _run(conversation_service.create_conversation())
            _run(
                conversation_service.add_attachment(
                    convo["id"], kind="ticket", ref="FM-9999"
                )
            )

        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        assert "FM-9999" not in joined

    def test_secret_in_message_not_logged_verbatim(
        self, conversation_service, caplog
    ):
        leaky = "AccountKey=" + "Z" * 86 + "=="
        with caplog.at_level(logging.DEBUG):
            convo = _run(conversation_service.create_conversation())
            _run(
                conversation_service.append_message(
                    convo["id"], role="user", content=leaky
                )
            )

        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        # The full secret value must never appear in the log.
        assert leaky not in joined
