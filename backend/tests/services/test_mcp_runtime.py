import asyncio
import sys
import time
from pathlib import Path

import pytest


REPO_BACKEND = Path(__file__).resolve().parent.parent.parent  # backend/


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "mcp_runtime_test.db"


@pytest.fixture
def runtime_setup(fake_keyring, db_path, tmp_path, monkeypatch):
    """Initialize DB, create runtime singleton with tmp data dir."""
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    monkeypatch.setenv("PYTHONPATH", str(REPO_BACKEND))

    import services.mcp.runtime as rt_mod
    rt_mod.reset_runtime_for_tests()
    monkeypatch.setenv("TESTDECK_MCP_DATA_DIR", str(tmp_path / "mcp-data"))
    rt = rt_mod.get_runtime()

    import services.mcp_connection_service as svc

    yield rt, svc

    asyncio.run(rt.stop())
    rt_mod.reset_runtime_for_tests()


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def _create_echo_connection(svc, *, enabled: bool = True, hang: bool = False):
    from schemas.mcp_models import McpConnectionCreate

    env = {"PYTHONPATH": str(REPO_BACKEND)}
    if hang:
        env["ECHO_HANG_TOOL"] = "1"
    payload = McpConnectionCreate(
        name="EchoRuntime",
        command=sys.executable,
        args=["-m", "tests.fixtures.echo_mcp"],
        env=env,
        enabled=enabled,
        autoApprove=[],
    )
    return _run(svc.create_connection(payload))


def test_lazy_spawn_on_list_tools(runtime_setup):
    rt, svc = runtime_setup
    conn = _create_echo_connection(svc)

    assert rt.status_for(conn.id) == "idle"

    async def go():
        tools = await rt.list_tools(conn.id)
        return tools

    tools = _run(go())
    assert any(t["name"] == "echo" for t in tools)
    assert rt.status_for(conn.id) == "running"

    _run(rt.disconnect(conn.id))
    assert rt.status_for(conn.id) == "idle"


def test_disconnect_kills_client(runtime_setup):
    rt, svc = runtime_setup
    conn = _create_echo_connection(svc)

    async def go():
        await rt.list_tools(conn.id)

    _run(go())
    assert rt.status_for(conn.id) == "running"

    _run(rt.disconnect(conn.id))
    assert rt.status_for(conn.id) == "idle"


def test_test_endpoint_tears_down(runtime_setup):
    rt, svc = runtime_setup
    conn = _create_echo_connection(svc)

    result = _run(rt.test(conn.id))
    assert result["ok"] is True
    assert result["toolCount"] >= 1
    assert "duration_ms" in result
    # Test mode never leaves a process behind.
    assert rt.status_for(conn.id) == "idle"


def test_disabled_connection_raises_permission_error(runtime_setup):
    rt, svc = runtime_setup
    conn = _create_echo_connection(svc, enabled=False)

    async def go():
        with pytest.raises(PermissionError):
            await rt.list_tools(conn.id)

    _run(go())


def test_unknown_connection_raises_lookup_error(runtime_setup):
    rt, _ = runtime_setup

    async def go():
        with pytest.raises(LookupError):
            await rt.list_tools("does-not-exist")

    _run(go())


def test_idle_gc_kills_client(runtime_setup, monkeypatch):
    rt, svc = runtime_setup
    conn = _create_echo_connection(svc)

    # Patch idle window to ~0 so the GC tick will kill on first pass.
    import services.mcp.runtime as rt_mod
    monkeypatch.setattr(rt_mod, "IDLE_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(rt_mod, "GC_INTERVAL_SECONDS", 0.05)

    async def go():
        await rt.start()
        await rt.list_tools(conn.id)
        # Sleep just past the GC tick interval.
        await asyncio.sleep(0.25)
        return rt.status_for(conn.id)

    status = _run(go())
    assert status == "idle"


def test_invoke_round_trip(runtime_setup):
    rt, svc = runtime_setup
    conn = _create_echo_connection(svc)

    async def go():
        return await rt.invoke(conn.id, "echo", {"k": "v"})

    out = _run(go())
    assert isinstance(out, dict)
    assert out.get("content") == {"k": "v"}
    _run(rt.disconnect(conn.id))


def test_test_on_bad_command_returns_error(runtime_setup):
    rt, svc = runtime_setup
    from schemas.mcp_models import McpConnectionCreate

    payload = McpConnectionCreate(
        name="Bad",
        command="/definitely/not/a/real/binary/path",
        args=[],
        env={},
    )
    conn = _run(svc.create_connection(payload))

    result = _run(rt.test(conn.id))
    assert result["ok"] is False
    assert result.get("error")
    # Even on failure, no process is left behind.
    assert rt.status_for(conn.id) == "error"
