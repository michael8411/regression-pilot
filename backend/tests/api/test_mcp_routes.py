import asyncio
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


REPO_BACKEND = Path(__file__).resolve().parent.parent.parent  # backend/


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "mcp_routes_test.db"


@pytest.fixture
def mcp_client(fake_keyring, db_path, tmp_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    monkeypatch.setenv("PYTHONPATH", str(REPO_BACKEND))

    import services.mcp.runtime as rt_mod
    rt_mod.reset_runtime_for_tests()
    monkeypatch.setenv("TESTDECK_MCP_DATA_DIR", str(tmp_path / "mcp-data"))

    from api.mcp_routes import router
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    yield client

    try:
        rt = rt_mod.get_runtime()
        asyncio.run(rt.stop())
    finally:
        rt_mod.reset_runtime_for_tests()


def _echo_body(**overrides):
    body = {
        "name": overrides.get("name", "EchoRoutes"),
        "command": overrides.get("command", sys.executable),
        "args": overrides.get("args", ["-m", "tests.fixtures.echo_mcp"]),
        "env": overrides.get("env", {"PYTHONPATH": str(REPO_BACKEND)}),
        "enabled": overrides.get("enabled", True),
        "autoApprove": overrides.get("autoApprove", []),
    }
    return body


class TestCRUD:

    def test_create_returns_full_env_but_list_redacts(self, mcp_client):
        r = mcp_client.post(
            "/mcp/connections",
            json=_echo_body(env={"TOKEN": "abc", "PATH": "/x"}),
        )
        assert r.status_code == 200
        body = r.json()
        assert "TOKEN" in body["env"]
        assert sorted(body["envKeys"]) == ["PATH", "TOKEN"]

        listed = mcp_client.get("/mcp/connections").json()
        assert len(listed) == 1
        item = listed[0]
        assert item["env"] == {}
        assert sorted(item["envKeys"]) == ["PATH", "TOKEN"]

    def test_get_unknown_404(self, mcp_client):
        r = mcp_client.get("/mcp/connections/does-not-exist")
        assert r.status_code == 404

    def test_get_returns_full_env(self, mcp_client):
        cid = mcp_client.post(
            "/mcp/connections", json=_echo_body(env={"K": "v"})
        ).json()["id"]
        r = mcp_client.get(f"/mcp/connections/{cid}")
        assert r.status_code == 200
        assert r.json()["env"] == {"K": "v"}

    def test_patch_updates(self, mcp_client):
        cid = mcp_client.post(
            "/mcp/connections", json=_echo_body()
        ).json()["id"]
        r = mcp_client.patch(
            f"/mcp/connections/{cid}", json={"name": "Renamed"}
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed"

    def test_patch_unknown_404(self, mcp_client):
        r = mcp_client.patch(
            "/mcp/connections/nope", json={"name": "x"}
        )
        assert r.status_code == 404

    def test_delete_then_404(self, mcp_client):
        cid = mcp_client.post(
            "/mcp/connections", json=_echo_body()
        ).json()["id"]
        r = mcp_client.delete(f"/mcp/connections/{cid}")
        assert r.status_code == 200
        assert r.json() == {"deleted": True}
        r = mcp_client.delete(f"/mcp/connections/{cid}")
        assert r.status_code == 404

    def test_bounds_enforced(self, mcp_client):
        r = mcp_client.post(
            "/mcp/connections",
            json=_echo_body(args=["a"] * 65),
        )
        assert r.status_code == 422


class TestTestEndpoint:

    def test_echo_test_returns_ok(self, mcp_client):
        cid = mcp_client.post(
            "/mcp/connections", json=_echo_body()
        ).json()["id"]
        r = mcp_client.post(f"/mcp/connections/{cid}/test")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["toolCount"] >= 1
        assert body["duration_ms"] >= 0

    def test_bad_command_test_returns_error(self, mcp_client):
        cid = mcp_client.post(
            "/mcp/connections",
            json=_echo_body(command="/definitely/not/a/real/binary"),
        ).json()["id"]
        r = mcp_client.post(f"/mcp/connections/{cid}/test")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is False
        assert body.get("error")


class TestToolsListing:

    def test_tools_endpoint_returns_echo(self, mcp_client):
        cid = mcp_client.post(
            "/mcp/connections", json=_echo_body()
        ).json()["id"]
        r = mcp_client.get(f"/mcp/connections/{cid}/tools")
        assert r.status_code == 200
        names = [t["name"] for t in r.json()]
        assert "echo" in names

    def test_disabled_connection_409(self, mcp_client):
        cid = mcp_client.post(
            "/mcp/connections", json=_echo_body(enabled=False)
        ).json()["id"]
        r = mcp_client.get(f"/mcp/connections/{cid}/tools")
        assert r.status_code == 409

    def test_unknown_connection_404(self, mcp_client):
        r = mcp_client.get("/mcp/connections/nope/tools")
        assert r.status_code == 404


class TestInvoke:

    def test_invoke_round_trip(self, mcp_client):
        cid = mcp_client.post(
            "/mcp/connections", json=_echo_body()
        ).json()["id"]
        r = mcp_client.post(
            f"/mcp/connections/{cid}/tools/echo/invoke",
            json={"requestId": "rc-1", "input": {"a": 1}},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["output"]["content"] == {"a": 1}
        assert body["duration_ms"] >= 0

    def test_invoke_unknown_connection_404(self, mcp_client):
        r = mcp_client.post(
            "/mcp/connections/nope/tools/echo/invoke",
            json={"requestId": "rc-1", "input": {}},
        )
        assert r.status_code == 404

    def test_invoke_disabled_409(self, mcp_client):
        cid = mcp_client.post(
            "/mcp/connections", json=_echo_body(enabled=False)
        ).json()["id"]
        r = mcp_client.post(
            f"/mcp/connections/{cid}/tools/echo/invoke",
            json={"requestId": "rc-1", "input": {}},
        )
        assert r.status_code == 409

    def test_invoke_timeout_returns_ok_false(self, mcp_client, monkeypatch):
        # Force a very short tool-call timeout, then point the echo at the
        # hang env so the call never returns.
        import services.mcp.runtime as rt_mod
        monkeypatch.setattr(rt_mod, "TOOL_CALL_TIMEOUT_SECONDS", 0.5)

        cid = mcp_client.post(
            "/mcp/connections",
            json=_echo_body(
                env={
                    "PYTHONPATH": str(REPO_BACKEND),
                    "ECHO_HANG_TOOL": "1",
                }
            ),
        ).json()["id"]
        r = mcp_client.post(
            f"/mcp/connections/{cid}/tools/echo/invoke",
            json={"requestId": "rc-1", "input": {}},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is False
        assert "mcp_request_timeout" in (body.get("error") or "")
