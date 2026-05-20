"""Verifies conversation_service merges the managed/manual tool catalog
before passing it to ai_service.stream_chat_message."""

import asyncio

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "convo_managed_catalog_test.db"


@pytest.fixture
def convo_env(fake_keyring, db_path, monkeypatch):
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


def test_stream_merges_backend_catalog_with_manual_attached(convo_env, monkeypatch):
    svc = convo_env
    convo = _run(svc.create_conversation("merge"))
    _run(
        svc.append_message(
            convo["id"],
            role="user",
            content="what changed in PR 42 and what does ABC-1 say?",
        )
    )

    captured: dict = {}

    async def fake_stream(messages, tickets, *, tool_catalog=None):
        captured["tool_catalog"] = list(tool_catalog or [])
        yield "ok"

    monkeypatch.setattr(svc.ai_service, "stream_chat_message", fake_stream)

    async def fake_build(conversation_id, *, user_message, attached_tool_refs):
        # Simulate backend producing managed + merged entries.
        return [
            *(attached_tool_refs or []),
            {
                "connection_id": "managed-github",
                "tool": "get_pull_request",
                "description": "",
                "inputSchema": {},
            },
        ]

    import services.mcp.tool_catalog_service as tcs

    monkeypatch.setattr(tcs, "build_assistant_tool_catalog", fake_build)

    _run(
        _collect(
            svc.stream_assistant_reply(
                convo["id"],
                tool_catalog=[
                    {
                        "connection_id": "manual-x",
                        "tool": "search_things",
                        "description": "",
                        "inputSchema": {},
                    }
                ],
            )
        )
    )

    tools = captured["tool_catalog"]
    names = {(t["connection_id"], t["tool"]) for t in tools}
    assert ("manual-x", "search_things") in names
    assert ("managed-github", "get_pull_request") in names


def test_tool_message_persistence_applies_output_budget(convo_env):
    svc = convo_env
    convo = _run(svc.create_conversation("budget"))
    huge_text = "y" * 200_000
    persisted = _run(
        svc.append_tool_message(
            convo["id"],
            {
                "request_id": "r1",
                "tool": "get_thing",
                "connection_id": "managed-github",
                "status": "done",
                "input": {},
                "output": {"definition": huge_text},
                "error": None,
                "duration_ms": 1,
            },
        )
    )
    assert persisted is not None
    assert persisted["meta"].get("budget", {}).get("truncated") is True
