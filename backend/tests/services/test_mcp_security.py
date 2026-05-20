import asyncio
import json
import logging
import sys
from pathlib import Path

import pytest


REPO_BACKEND = Path(__file__).resolve().parent.parent.parent  # backend/


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "mcp_security_test.db"


@pytest.fixture
def setup(fake_keyring, db_path, tmp_path, monkeypatch):
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


def _create(svc, **overrides):
    from schemas.mcp_models import McpConnectionCreate

    payload = McpConnectionCreate(
        name=overrides.get("name", "EchoSec"),
        command=overrides.get("command", sys.executable),
        args=overrides.get("args", ["-m", "tests.fixtures.echo_mcp"]),
        env=overrides.get("env", {"FOO": "bar"}),
        enabled=overrides.get("enabled", True),
        autoApprove=overrides.get("autoApprove", []),
    )
    return _run(svc.create_connection(payload))


class TestEncryptionAtRest:

    def test_env_encrypted_when_present(self, setup):
        _rt, svc = setup
        conn = _create(svc, env={"TOKEN": "supersecret"})

        async def read_raw():
            from db.connection import get_connection
            async with get_connection() as db:
                cursor = await db.execute(
                    "SELECT env, auto_approve FROM mcp_connections WHERE id = ?",
                    (conn.id,),
                )
                return await cursor.fetchone()

        row = _run(read_raw())
        assert row["env"].startswith("gAAAAAB")
        assert "supersecret" not in row["env"]
        with pytest.raises(json.JSONDecodeError):
            json.loads(row["env"])

    def test_env_empty_string_when_no_env(self, setup):
        _rt, svc = setup
        conn = _create(svc, env={})

        async def read_raw():
            from db.connection import get_connection
            async with get_connection() as db:
                cursor = await db.execute(
                    "SELECT env FROM mcp_connections WHERE id = ?",
                    (conn.id,),
                )
                return await cursor.fetchone()

        row = _run(read_raw())
        assert row["env"] == ""

    def test_auto_approve_encrypted_when_present(self, setup):
        _rt, svc = setup
        conn = _create(svc, autoApprove=["sensitive_tool"])

        async def read_raw():
            from db.connection import get_connection
            async with get_connection() as db:
                cursor = await db.execute(
                    "SELECT auto_approve FROM mcp_connections WHERE id = ?",
                    (conn.id,),
                )
                return await cursor.fetchone()

        row = _run(read_raw())
        assert row["auto_approve"].startswith("gAAAAAB")
        assert "sensitive_tool" not in row["auto_approve"]


class TestCorruptionResilience:

    def test_get_does_not_500_when_env_corrupt(self, setup):
        _rt, svc = setup
        conn = _create(svc, env={"X": "1"})

        async def corrupt():
            from db.connection import get_connection
            async with get_connection() as db:
                await db.execute(
                    "UPDATE mcp_connections SET env = ? WHERE id = ?",
                    ("not-a-fernet-token", conn.id),
                )
                await db.commit()

        _run(corrupt())

        def _idle(_):
            return "idle"

        def _no_err(_):
            return None

        out = _run(
            svc.get_connection_by_id(
                conn.id, runtime_status=_idle, runtime_errors=_no_err
            )
        )
        assert out is not None
        assert out.env == {}


class TestSpawnSafety:

    def test_inherited_env_is_whitelisted(self, setup, monkeypatch):
        """Random parent env vars must not leak into MCP children."""
        rt, svc = setup
        monkeypatch.setenv("MY_SECRET_VAR", "leak-me-please")
        # User-supplied env intentionally includes ECHO_DUMP_ENV so the
        # echo server writes os.environ to stderr, which we then inspect.
        conn = _create(
            svc,
            env={
                "PYTHONPATH": str(REPO_BACKEND),
                "ECHO_DUMP_ENV": "1",
            },
        )

        async def go():
            client = await rt._ensure_client(conn.id)  # type: ignore[attr-defined]
            await asyncio.sleep(0.3)
            tail = await client.stderr_tail()
            await rt.disconnect(conn.id)
            return tail

        tail = _run(go())
        text = tail.decode("utf-8", errors="replace")
        # The user-supplied env IS forwarded …
        assert "ECHO_DUMP_ENV=1" in text
        # … but unrelated parent env vars are NOT.
        assert "MY_SECRET_VAR" not in text
        assert "leak-me-please" not in text


class TestLogHygiene:

    def test_no_env_value_in_logs(self, setup, caplog):
        _rt, svc = setup
        with caplog.at_level(logging.INFO):
            _create(svc, env={"TOKEN": "supersecret-do-not-leak"})

        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        assert "supersecret-do-not-leak" not in joined

    def test_no_secret_in_args_logged_verbatim(self, setup, caplog):
        _rt, svc = setup
        leaky = "AccountKey=" + "Z" * 86 + "=="
        with caplog.at_level(logging.INFO):
            _create(svc, args=["-m", "tests.fixtures.echo_mcp", leaky])

        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        assert leaky not in joined
