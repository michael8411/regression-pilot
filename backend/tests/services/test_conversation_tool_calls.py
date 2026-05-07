import asyncio
import json
import logging

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "convo_tool_calls_test.db"


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


async def _collect(agen):
    out = []
    async for e in agen:
        out.append(e)
    return out


def _make_chunked_stream(chunks):
    """Async generator yielding either str or {"tool_call": ...} entries."""

    async def gen(messages, tickets, *, tool_catalog=None):
        for c in chunks:
            yield c

    return gen


class TestToolCallParser:

    def test_tag_parser_emits_event(self):
        from services.ai_service import _ToolCallStreamParser

        parser = _ToolCallStreamParser()
        out = parser.feed(
            'before <tool name="echo" connection="abc">{"x": 1}</tool> after'
        )
        # First text segment, then a tool_call event, then "after" still buffered.
        text_chunks = [o for o in out if isinstance(o, str)]
        events = [o for o in out if isinstance(o, dict)]
        assert "before " in "".join(text_chunks)
        assert len(events) == 1
        evt = events[0]["tool_call"]
        assert evt["tool"] == "echo"
        assert evt["connection_id"] == "abc"
        assert evt["input"] == {"x": 1}
        assert evt["request_id"].startswith("tc_")

    def test_tag_spanning_two_chunks(self):
        from services.ai_service import _ToolCallStreamParser

        parser = _ToolCallStreamParser()
        out1 = parser.feed('hello <tool name="echo" connection="c">{"a":')
        out2 = parser.feed(' 2}</tool>tail')
        all_out = out1 + out2
        events = [o for o in all_out if isinstance(o, dict)]
        assert len(events) == 1
        assert events[0]["tool_call"]["input"] == {"a": 2}

    def test_malformed_json_falls_back_to_text(self):
        from services.ai_service import _ToolCallStreamParser

        parser = _ToolCallStreamParser()
        out = parser.feed(
            '<tool name="x" connection="c">{not json}</tool>'
        )
        # Falls back to plain text — no tool event, but the raw tag is preserved.
        events = [o for o in out if isinstance(o, dict)]
        assert events == []
        assert any("not json" in s for s in out if isinstance(s, str))


class TestStreamWithToolCall:

    def test_text_persisted_then_tool_call_yielded(
        self, conversation_service, monkeypatch
    ):
        convo = _run(conversation_service.create_conversation())
        _run(
            conversation_service.append_message(
                convo["id"], role="user", content="please use echo"
            )
        )

        # The mocked ai_service yields what the real parser would emit:
        # plain text strings interleaved with `tool_call` dict events. The
        # conversation_service then handles persisting pre-tool text and
        # short-circuiting after the tool call.
        chunks: list = [
            "I will use the tool. ",
            {
                "tool_call": {
                    "request_id": "tc_abc",
                    "connection_id": "conn-1",
                    "tool": "echo",
                    "input": {"q": "hi"},
                }
            },
            # Should NEVER be reached — stream stops on the tool_call.
            "trailing should not appear",
        ]
        monkeypatch.setattr(
            conversation_service.ai_service,
            "stream_chat_message",
            _make_chunked_stream(chunks),
        )

        events = _run(
            _collect(
                conversation_service.stream_assistant_reply(
                    convo["id"],
                    tool_catalog=[
                        {
                            "connection_id": "conn-1",
                            "tool": "echo",
                            "description": "echo input",
                        }
                    ],
                )
            )
        )

        text_events = [e for e in events if "text" in e]
        tool_events = [e for e in events if "tool_call" in e]

        assert tool_events, events
        assert tool_events[0]["tool_call"]["tool"] == "echo"
        # Stream stops after the tool_call; nothing after the tag was emitted.
        assert "trailing should not appear" not in "".join(
            e.get("text", "") for e in text_events
        )
        # No `done` event is emitted on the tool_call short-circuit; the
        # client drives the next turn after recording the tool result.
        assert not any("done" in e for e in events)

        # Pre-tool assistant text was persisted as an assistant message.
        full = _run(conversation_service.get_conversation(convo["id"]))
        assistant_msgs = [m for m in full["messages"] if m["role"] == "assistant"]
        assert any(
            "I will use the tool." in m["content"] for m in assistant_msgs
        )


class TestAppendToolMessage:

    def test_round_trip(self, conversation_service):
        convo = _run(conversation_service.create_conversation())
        out = _run(
            conversation_service.append_tool_message(
                convo["id"],
                {
                    "request_id": "tc_abc",
                    "tool": "echo",
                    "connection_id": "conn-1",
                    "status": "done",
                    "input": {"q": "hi"},
                    "output": {"content": "hi"},
                    "error": None,
                    "duration_ms": 12,
                },
            )
        )
        assert out is not None
        assert out["role"] == "tool"
        body = json.loads(out["content"])
        assert body["tool"] == "echo"
        assert body["status"] == "done"
        assert body["output"] == {"content": "hi"}

        full = _run(conversation_service.get_conversation(convo["id"]))
        tool_msgs = [m for m in full["messages"] if m["role"] == "tool"]
        assert len(tool_msgs) == 1
        assert tool_msgs[0]["meta"] == {}

    def test_unknown_conversation_returns_none(self, conversation_service):
        out = _run(
            conversation_service.append_tool_message(
                "00000000-0000-0000-0000-000000000000",
                {
                    "request_id": "tc_1",
                    "tool": "echo",
                    "connection_id": "c",
                    "status": "done",
                    "input": {},
                    "output": {},
                    "error": None,
                    "duration_ms": 0,
                },
            )
        )
        assert out is None

    def test_secret_in_output_flags_warning_meta(
        self, conversation_service
    ):
        convo = _run(conversation_service.create_conversation())
        leaky = "AccountKey=" + "Q" * 86 + "=="
        out = _run(
            conversation_service.append_tool_message(
                convo["id"],
                {
                    "request_id": "tc_xyz",
                    "tool": "echo",
                    "connection_id": "conn-1",
                    "status": "done",
                    "input": {},
                    "output": {"text": leaky},
                    "error": None,
                    "duration_ms": 7,
                },
            )
        )
        assert out is not None
        assert out["meta"].get("warning") == "secret_in_tool_output"
        assert "AZURE_STORAGE_KEY" in out["meta"].get("secret_patterns", [])

    def test_logs_no_full_secret_value(self, conversation_service, caplog):
        convo = _run(conversation_service.create_conversation())
        leaky = "AccountKey=" + "P" * 86 + "=="
        with caplog.at_level(logging.INFO):
            _run(
                conversation_service.append_tool_message(
                    convo["id"],
                    {
                        "request_id": "tc_xyz",
                        "tool": "echo",
                        "connection_id": "conn-1",
                        "status": "done",
                        "input": {},
                        "output": {"text": leaky},
                        "error": None,
                        "duration_ms": 7,
                    },
                )
            )
        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        assert leaky not in joined


class TestToolCatalogBuilds:

    def test_prompt_omitted_when_no_tools(self):
        from services.ai_service import _build_tool_catalog_prompt
        assert _build_tool_catalog_prompt([]) == ""

    def test_prompt_lists_tools(self):
        from services.ai_service import _build_tool_catalog_prompt
        text = _build_tool_catalog_prompt(
            [
                {
                    "connection_id": "abc",
                    "tool": "echo",
                    "description": "echo input",
                }
            ]
        )
        assert "echo" in text
        assert "abc" in text
        assert "<tool" in text
        assert "</tool>" in text
