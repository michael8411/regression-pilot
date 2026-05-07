import asyncio
import os
import sys
from pathlib import Path

import pytest


REPO_BACKEND = Path(__file__).resolve().parent.parent.parent  # backend/


def _make_client(tmp_path: Path, *, env_overrides: dict | None = None,
                 fail_handshake: bool = False, hang_tool: bool = False,
                 dump_argv: bool = False) -> "McpClient":
    from services.mcp.client import McpClient

    env: dict[str, str] = {"PYTHONUNBUFFERED": "1"}
    if env_overrides:
        env.update(env_overrides)
    if fail_handshake:
        env["ECHO_FAIL_HANDSHAKE"] = "1"
    if hang_tool:
        env["ECHO_HANG_TOOL"] = "1"
    if dump_argv:
        env["ECHO_DUMP_ARGV"] = "1"

    cwd = tmp_path / "echo-cwd"
    cwd.mkdir(exist_ok=True)
    return McpClient(
        connection_id="test-conn",
        command=sys.executable,
        args=["-m", "tests.fixtures.echo_mcp"],
        env=env,
        cwd=str(cwd),
    )


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


@pytest.fixture(autouse=True)
def _ensure_pythonpath(monkeypatch):
    # `python -m tests.fixtures.echo_mcp` needs backend/ on PYTHONPATH so
    # `tests.fixtures.echo_mcp` is importable. The echo server is launched as
    # a child process; we forward PYTHONPATH via the user-supplied env.
    monkeypatch.setenv("PYTHONPATH", str(REPO_BACKEND))


def test_handshake_and_list_tools(tmp_path):
    async def go():
        client = _make_client(
            tmp_path, env_overrides={"PYTHONPATH": str(REPO_BACKEND)}
        )
        await client.start()
        try:
            assert client.started is True
            tools = await client.list_tools()
            assert any(t["name"] == "echo" for t in tools)
        finally:
            await client.stop()
        assert client.started is False

    _run(go())


def test_call_tool_echoes_arguments(tmp_path):
    async def go():
        client = _make_client(
            tmp_path, env_overrides={"PYTHONPATH": str(REPO_BACKEND)}
        )
        await client.start()
        try:
            result = await client.call_tool(
                "echo", {"hello": "world"}, timeout=5.0
            )
            assert isinstance(result, dict)
            assert result.get("content") == {"hello": "world"}
        finally:
            await client.stop()

    _run(go())


def test_bad_command_raises(tmp_path):
    from services.mcp.client import McpClient

    async def go():
        client = McpClient(
            connection_id="bad",
            command="/nonexistent/path/echo-mcp",
            args=[],
            env={},
            cwd=str(tmp_path),
        )
        with pytest.raises((FileNotFoundError, OSError)):
            await client.start()

    _run(go())


def test_handshake_failure_raises(tmp_path):
    async def go():
        client = _make_client(
            tmp_path,
            env_overrides={"PYTHONPATH": str(REPO_BACKEND)},
            fail_handshake=True,
        )
        with pytest.raises(Exception):
            await client.start()
        # Process should have been cleaned up.
        await client.stop()

    _run(go())


def test_tool_call_timeout_raises(tmp_path):
    async def go():
        client = _make_client(
            tmp_path,
            env_overrides={"PYTHONPATH": str(REPO_BACKEND)},
            hang_tool=True,
        )
        await client.start()
        try:
            with pytest.raises(TimeoutError):
                await client.call_tool("echo", {}, timeout=0.5)
        finally:
            await client.stop()

    _run(go())


def test_call_after_stop_raises(tmp_path):
    async def go():
        client = _make_client(
            tmp_path, env_overrides={"PYTHONPATH": str(REPO_BACKEND)}
        )
        await client.start()
        await client.stop()
        with pytest.raises(ConnectionError):
            await client.call_tool("echo", {}, timeout=1.0)

    _run(go())


def test_stderr_tail_captures_child_stderr(tmp_path):
    async def go():
        client = _make_client(
            tmp_path,
            env_overrides={"PYTHONPATH": str(REPO_BACKEND), "ECHO_DUMP_ARGV": "1"},
        )
        await client.start()
        try:
            # Give the stderr loop a beat to drain.
            await asyncio.sleep(0.2)
            tail = await client.stderr_tail()
            assert b"ARGV" in tail
        finally:
            await client.stop()

    _run(go())
