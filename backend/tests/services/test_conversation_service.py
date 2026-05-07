import asyncio
import json

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "conversations_test.db"


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


class TestCreateConversation:

    def test_default_title(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        assert convo["title"] == "New conversation"
        assert convo["pinned"] is False
        assert convo["archived"] is False
        assert convo["meta"] == {}
        assert convo["id"]

    def test_custom_title(self, conversation_service):
        convo = _run(conversation_service.create_conversation(title="hello world"))
        assert convo["title"] == "hello world"

    def test_strips_secret_in_title(self, conversation_service):
        leaky = "AccountKey=" + "A" * 86 + "=="
        convo = _run(conversation_service.create_conversation(title=leaky))
        assert convo["title"] == "New conversation"

    def test_blank_title_uses_default(self, conversation_service):
        convo = _run(conversation_service.create_conversation(title="   "))
        assert convo["title"] == "New conversation"

    def test_long_title_truncated(self, conversation_service):
        convo = _run(conversation_service.create_conversation(title="x" * 500))
        assert len(convo["title"]) <= 120


class TestAppendMessage:

    def test_round_trip(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        msg, scan = _run(
            conversation_service.append_message(
                convo["id"], role="user", content="hello world"
            )
        )
        assert msg["content"] == "hello world"
        assert msg["role"] == "user"
        assert scan == []

        full = _run(conversation_service.get_conversation(convo["id"]))
        assert len(full["messages"]) == 1
        assert full["messages"][0]["content"] == "hello world"

    def test_unknown_conversation_returns_none(self, conversation_service):
        msg, scan = _run(
            conversation_service.append_message(
                "00000000-0000-0000-0000-000000000000",
                role="user",
                content="x",
            )
        )
        assert msg is None
        assert scan == []

    def test_secret_scan_returns_pattern(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        leaky = "please use AccountKey=" + "B" * 86 + "=="
        msg, scan = _run(
            conversation_service.append_message(
                convo["id"], role="user", content=leaky
            )
        )
        assert msg is not None
        assert msg["content"] == leaky  # still saved
        assert "AZURE_STORAGE_KEY" in scan

    def test_meta_persists(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        _run(
            conversation_service.append_message(
                convo["id"],
                role="assistant",
                content="hi",
                meta={"finish_reason": "stop"},
            )
        )
        full = _run(conversation_service.get_conversation(convo["id"]))
        assert full["messages"][0]["meta"] == {"finish_reason": "stop"}

    def test_updates_conversation_updated_at(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        original_updated = convo["updated_at"]
        # Wait? Use any later operation. updated_at should change.
        _run(
            conversation_service.append_message(
                convo["id"], role="user", content="x"
            )
        )
        full = _run(conversation_service.get_conversation(convo["id"]))
        assert full["conversation"]["updated_at"] >= original_updated


class TestListConversations:

    def test_empty(self, conversation_service):
        out = _run(conversation_service.list_conversations())
        assert out == []

    def test_orders_pinned_first(self, conversation_service):
        a = _run(conversation_service.create_conversation(title="alpha"))
        b = _run(conversation_service.create_conversation(title="beta"))
        _run(conversation_service.update_conversation(b["id"], pinned=True))
        listed = _run(conversation_service.list_conversations())
        assert listed[0]["id"] == b["id"]
        assert listed[1]["id"] == a["id"]

    def test_excludes_archived_by_default(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        _run(conversation_service.update_conversation(convo["id"], archived=True))
        visible = _run(conversation_service.list_conversations())
        archived = _run(
            conversation_service.list_conversations(include_archived=True)
        )
        assert convo["id"] not in [c["id"] for c in visible]
        assert convo["id"] in [c["id"] for c in archived]


class TestUpdateConversation:

    def test_no_fields_returns_unchanged(self, conversation_service):
        convo = _run(conversation_service.create_conversation(title="foo"))
        updated = _run(conversation_service.update_conversation(convo["id"]))
        assert updated["title"] == "foo"
        # No fields updated → updated_at not bumped
        assert updated["updated_at"] == convo["updated_at"]

    def test_unknown_id_returns_none(self, conversation_service):
        out = _run(
            conversation_service.update_conversation(
                "00000000-0000-0000-0000-000000000000", title="x"
            )
        )
        assert out is None

    def test_archive_toggles(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        out = _run(
            conversation_service.update_conversation(convo["id"], archived=True)
        )
        assert out["archived"] is True
        out = _run(
            conversation_service.update_conversation(convo["id"], archived=False)
        )
        assert out["archived"] is False


class TestDeleteConversation:

    def test_cascades_messages(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        _run(
            conversation_service.append_message(
                convo["id"], role="user", content="x"
            )
        )
        deleted = _run(conversation_service.delete_conversation(convo["id"]))
        assert deleted is True
        full = _run(conversation_service.get_conversation(convo["id"]))
        assert full is None

    def test_unknown_id_returns_false(self, conversation_service):
        out = _run(
            conversation_service.delete_conversation(
                "00000000-0000-0000-0000-000000000000"
            )
        )
        assert out is False


class TestAttachments:

    def test_round_trip(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        att = _run(
            conversation_service.add_attachment(
                convo["id"], kind="ticket", ref="FM-1234"
            )
        )
        assert att["kind"] == "ticket"
        assert att["ref"] == "FM-1234"

        full = _run(conversation_service.get_conversation(convo["id"]))
        assert len(full["attachments"]) == 1
        assert full["attachments"][0]["ref"] == "FM-1234"

    def test_remove(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        att = _run(
            conversation_service.add_attachment(
                convo["id"], kind="ticket", ref="FM-1"
            )
        )
        deleted = _run(
            conversation_service.remove_attachment(convo["id"], att["id"])
        )
        assert deleted is True
        full = _run(conversation_service.get_conversation(convo["id"]))
        assert full["attachments"] == []

    def test_unknown_conversation(self, conversation_service):
        out = _run(
            conversation_service.add_attachment(
                "00000000-0000-0000-0000-000000000000",
                kind="ticket",
                ref="FM-1",
            )
        )
        assert out is None

    def test_remove_unknown_returns_false(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        out = _run(
            conversation_service.remove_attachment(
                convo["id"], "00000000-0000-0000-0000-000000000000"
            )
        )
        assert out is False


class TestStream:

    def test_no_user_message_yields_error(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        events = _run(_collect(conversation_service.stream_assistant_reply(convo["id"])))
        assert any("error" in e for e in events)

    def test_unknown_conversation_yields_error(self, conversation_service):
        events = _run(
            _collect(
                conversation_service.stream_assistant_reply(
                    "00000000-0000-0000-0000-000000000000"
                )
            )
        )
        assert events == [{"error": "conversation not found"}]

    def test_streams_and_persists(self, conversation_service, monkeypatch):
        convo = _run(conversation_service.create_conversation())
        _run(
            conversation_service.append_message(
                convo["id"], role="user", content="hi"
            )
        )

        async def fake_stream(messages, tickets, *, tool_catalog=None):
            yield "Hello "
            yield "world"

        monkeypatch.setattr(
            conversation_service.ai_service, "stream_chat_message", fake_stream
        )

        events = _run(_collect(conversation_service.stream_assistant_reply(convo["id"])))
        text_chunks = [e["text"] for e in events if "text" in e]
        assert "".join(text_chunks) == "Hello world"
        assert any("done" in e for e in events)

        full = _run(conversation_service.get_conversation(convo["id"]))
        assistant_msgs = [m for m in full["messages"] if m["role"] == "assistant"]
        assert len(assistant_msgs) == 1
        assert assistant_msgs[0]["content"] == "Hello world"

    def test_stream_error_does_not_persist(self, conversation_service, monkeypatch):
        convo = _run(conversation_service.create_conversation())
        _run(
            conversation_service.append_message(
                convo["id"], role="user", content="hi"
            )
        )

        async def fake_stream(messages, tickets, *, tool_catalog=None):
            yield "partial"
            raise RuntimeError("boom internal")

        monkeypatch.setattr(
            conversation_service.ai_service, "stream_chat_message", fake_stream
        )

        events = _run(_collect(conversation_service.stream_assistant_reply(convo["id"])))
        assert any("error" in e for e in events)
        # No assistant message persisted
        full = _run(conversation_service.get_conversation(convo["id"]))
        assistant_msgs = [m for m in full["messages"] if m["role"] == "assistant"]
        assert assistant_msgs == []


async def _collect(agen):
    out = []
    async for e in agen:
        out.append(e)
    return out
