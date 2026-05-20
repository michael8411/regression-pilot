import asyncio
import json

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "mcp_conn_test.db"


@pytest.fixture
def svc(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    import services.mcp_connection_service as mod
    return mod


def _run(coro):
    return asyncio.run(coro)


def _idle(_):
    return "idle"


def _no_err(_):
    return None


def _create(svc, **overrides):
    from schemas.mcp_models import McpConnectionCreate

    payload = McpConnectionCreate(
        name=overrides.get("name", "Echo"),
        command=overrides.get("command", "/usr/bin/echo"),
        args=overrides.get("args", ["a", "b"]),
        env=overrides.get("env", {"FOO": "bar"}),
        enabled=overrides.get("enabled", True),
        autoApprove=overrides.get("autoApprove", ["echo"]),
    )
    return _run(svc.create_connection(payload))


class TestCreate:

    def test_round_trip(self, svc):
        conn = _create(svc)
        assert conn.name == "Echo"
        assert conn.command == "/usr/bin/echo"
        assert conn.args == ["a", "b"]
        assert conn.env == {"FOO": "bar"}
        assert conn.envKeys == ["FOO"]
        assert conn.enabled is True
        assert conn.autoApprove == ["echo"]
        assert conn.status == "idle"
        assert conn.lastError is None

    def test_empty_env_round_trip(self, svc):
        conn = _create(svc, env={})
        assert conn.env == {}
        assert conn.envKeys == []

    def test_empty_auto_approve_round_trip(self, svc):
        conn = _create(svc, autoApprove=[])
        assert conn.autoApprove == []


class TestList:

    def test_redacts_env(self, svc):
        conn = _create(svc)
        listed = _run(
            svc.list_connections(runtime_status=_idle, runtime_errors=_no_err)
        )
        assert len(listed) == 1
        item = listed[0]
        assert item.id == conn.id
        # Env values redacted in list responses; keys preserved.
        assert item.env == {}
        assert item.envKeys == ["FOO"]


class TestGetById:

    def test_returns_full_env(self, svc):
        conn = _create(svc, env={"X": "1", "Y": "2"})
        fetched = _run(
            svc.get_connection_by_id(
                conn.id, runtime_status=_idle, runtime_errors=_no_err
            )
        )
        assert fetched is not None
        assert fetched.env == {"X": "1", "Y": "2"}

    def test_unknown_id_returns_none(self, svc):
        out = _run(
            svc.get_connection_by_id(
                "nope", runtime_status=_idle, runtime_errors=_no_err
            )
        )
        assert out is None


class TestPatch:

    def test_partial_update(self, svc):
        from schemas.mcp_models import McpConnectionPatch

        conn = _create(svc)
        out = _run(
            svc.patch_connection(conn.id, McpConnectionPatch(name="Renamed"))
        )
        assert out is not None
        assert out.name == "Renamed"
        assert out.command == conn.command

    def test_replace_env(self, svc):
        from schemas.mcp_models import McpConnectionPatch

        conn = _create(svc, env={"OLD": "v"})
        _run(
            svc.patch_connection(
                conn.id, McpConnectionPatch(env={"NEW": "z"})
            )
        )
        fetched = _run(
            svc.get_connection_by_id(
                conn.id, runtime_status=_idle, runtime_errors=_no_err
            )
        )
        assert fetched is not None
        assert fetched.env == {"NEW": "z"}

    def test_clear_env_to_empty(self, svc):
        from schemas.mcp_models import McpConnectionPatch

        conn = _create(svc, env={"OLD": "v"})
        _run(svc.patch_connection(conn.id, McpConnectionPatch(env={})))
        fetched = _run(
            svc.get_connection_by_id(
                conn.id, runtime_status=_idle, runtime_errors=_no_err
            )
        )
        assert fetched is not None
        assert fetched.env == {}
        # And the column is now an empty string (not Fernet ciphertext).

        async def read_raw():
            from db.connection import get_connection
            async with get_connection() as db:
                cursor = await db.execute(
                    "SELECT env FROM mcp_connections WHERE id = ?", (conn.id,)
                )
                return await cursor.fetchone()

        row = _run(read_raw())
        assert row["env"] == ""

    def test_unknown_id_returns_none(self, svc):
        from schemas.mcp_models import McpConnectionPatch

        out = _run(
            svc.patch_connection("nope", McpConnectionPatch(name="x"))
        )
        assert out is None


class TestDelete:

    def test_delete_removes(self, svc):
        conn = _create(svc)
        assert _run(svc.delete_connection(conn.id)) is True
        out = _run(
            svc.get_connection_by_id(
                conn.id, runtime_status=_idle, runtime_errors=_no_err
            )
        )
        assert out is None

    def test_delete_unknown_returns_false(self, svc):
        assert _run(svc.delete_connection("nope")) is False


class TestBounds:

    def test_too_many_args_rejected(self, svc):
        from pydantic import ValidationError
        from schemas.mcp_models import McpConnectionCreate

        with pytest.raises(ValidationError):
            McpConnectionCreate(
                name="x", command="c", args=["a"] * 65
            )

    def test_too_many_env_rejected(self, svc):
        from pydantic import ValidationError
        from schemas.mcp_models import McpConnectionCreate

        env = {f"K{i}": "v" for i in range(65)}
        with pytest.raises(ValidationError):
            McpConnectionCreate(name="x", command="c", env=env)

    def test_arg_too_long_rejected(self, svc):
        from pydantic import ValidationError
        from schemas.mcp_models import McpConnectionCreate

        with pytest.raises(ValidationError):
            McpConnectionCreate(
                name="x", command="c", args=["a" * 5000]
            )

    def test_invalid_env_key_rejected(self, svc):
        from pydantic import ValidationError
        from schemas.mcp_models import McpConnectionCreate

        with pytest.raises(ValidationError):
            McpConnectionCreate(
                name="x", command="c", env={"FOO BAR": "v"}
            )


class TestCorruption:

    def test_corrupted_env_returns_empty(self, svc):
        conn = _create(svc, env={"GOOD": "v"})

        async def corrupt():
            from db.connection import get_connection
            async with get_connection() as db:
                await db.execute(
                    "UPDATE mcp_connections SET env = ? WHERE id = ?",
                    ("not-a-fernet-token", conn.id),
                )
                await db.commit()

        _run(corrupt())
        fetched = _run(
            svc.get_connection_by_id(
                conn.id, runtime_status=_idle, runtime_errors=_no_err
            )
        )
        assert fetched is not None
        assert fetched.env == {}
        assert fetched.envKeys == []

    def test_corrupted_auto_approve_returns_empty(self, svc):
        conn = _create(svc, autoApprove=["t1", "t2"])

        async def corrupt():
            from db.connection import get_connection
            async with get_connection() as db:
                await db.execute(
                    "UPDATE mcp_connections SET auto_approve = ? WHERE id = ?",
                    ("not-a-fernet-token", conn.id),
                )
                await db.commit()

        _run(corrupt())
        fetched = _run(
            svc.get_connection_by_id(
                conn.id, runtime_status=_idle, runtime_errors=_no_err
            )
        )
        assert fetched is not None
        assert fetched.autoApprove == []


class TestSecretScan:

    def test_args_secret_does_not_block_save(self, svc):
        # Putting a token-like string in args is an anti-pattern that the
        # scanner should warn about — but it must never block the save.
        leaky = "AccountKey=" + "A" * 86 + "=="
        conn = _create(svc, args=[leaky])
        assert conn is not None
        # Round-trip preserves the (anti-pattern) value exactly.
        assert conn.args == [leaky]

    def test_args_secret_no_full_value_in_info_logs(self, svc, caplog):
        import logging

        leaky = "AccountKey=" + "B" * 86 + "=="
        with caplog.at_level(logging.INFO):
            _create(svc, args=[leaky])

        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        # At INFO level, aiosqlite is quiet and the scanner only logs
        # pattern names — never the full secret value.
        assert leaky not in joined
