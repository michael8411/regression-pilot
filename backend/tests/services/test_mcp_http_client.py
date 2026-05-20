"""HTTP MCP client smoke tests (Phase 4).

We don't bind a real HTTP server; we monkeypatch httpx.AsyncClient.post
to return canned JSON-RPC envelopes so the protocol surface (initialize +
tools/list + tools/call) is exercised end-to-end through the client.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

import pytest

from services.mcp.http_client import McpHttpClient


@dataclass
class FakeResponse:
    status_code: int
    body: Any

    def json(self):
        return self.body

    @property
    def text(self):
        try:
            return json.dumps(self.body)
        except Exception:
            return str(self.body)


class FakeAsyncClient:
    """Minimal httpx.AsyncClient stand-in driven by a scripted handler."""

    def __init__(self, handler) -> None:
        self._handler = handler
        self.headers: dict[str, str] = {}
        self.calls: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def post(self, url, json=None, timeout=None):
        self.calls.append({"url": url, "json": json})
        return self._handler(json)

    async def aclose(self):
        return None


def install_fake_client(monkeypatch, handler):
    fake = FakeAsyncClient(handler)

    def _factory(*_args, **kw):
        if "headers" in kw and isinstance(kw["headers"], dict):
            fake.headers.update(kw["headers"])
        return fake

    monkeypatch.setattr("services.mcp.http_client.httpx.AsyncClient", _factory)
    return fake


class TestHttpClientHappyPath:
    def test_handshake_lists_tools(self, monkeypatch):
        def handler(envelope):
            method = envelope["method"]
            if method == "initialize":
                return FakeResponse(
                    200,
                    {
                        "jsonrpc": "2.0",
                        "id": envelope["id"],
                        "result": {"serverInfo": {"name": "fake"}},
                    },
                )
            if method == "notifications/initialized":
                return FakeResponse(200, {})
            if method == "tools/list":
                return FakeResponse(
                    200,
                    {
                        "jsonrpc": "2.0",
                        "id": envelope["id"],
                        "result": {
                            "tools": [
                                {
                                    "name": "search",
                                    "description": "search docs",
                                    "inputSchema": {"type": "object"},
                                }
                            ]
                        },
                    },
                )
            return FakeResponse(
                200,
                {
                    "jsonrpc": "2.0",
                    "id": envelope["id"],
                    "result": "ok",
                },
            )

        install_fake_client(monkeypatch, handler)
        client = McpHttpClient(
            connection_id="c1", url="https://example/mcp", env={}
        )
        asyncio.run(_drive_handshake_and_tools(client))
        assert client.started is True

    def test_bearer_auth_header_set(self, monkeypatch):
        def handler(envelope):
            return FakeResponse(
                200,
                {"jsonrpc": "2.0", "id": envelope.get("id", 1), "result": {}},
            )

        fake = install_fake_client(monkeypatch, handler)
        client = McpHttpClient(
            connection_id="c2",
            url="https://example/mcp",
            env={"AUTH_TYPE": "bearer", "AUTH_TOKEN": "abcd"},
        )
        asyncio.run(client.start())
        assert fake.headers.get("authorization") == "Bearer abcd"


class TestHttpClientFailureModes:
    def test_http_error_surface(self, monkeypatch):
        def handler(envelope):
            return FakeResponse(500, {"error": "boom"})

        install_fake_client(monkeypatch, handler)
        client = McpHttpClient(
            connection_id="c3", url="https://example/mcp", env={}
        )
        with pytest.raises(ConnectionError):
            asyncio.run(client.start())

    def test_rpc_error_surface(self, monkeypatch):
        def handler(envelope):
            return FakeResponse(
                200,
                {
                    "jsonrpc": "2.0",
                    "id": envelope["id"],
                    "error": {"code": -32601, "message": "method not found"},
                },
            )

        install_fake_client(monkeypatch, handler)
        client = McpHttpClient(
            connection_id="c4", url="https://example/mcp", env={}
        )
        with pytest.raises(RuntimeError):
            asyncio.run(client.start())

    def test_missing_url(self, monkeypatch):
        client = McpHttpClient(connection_id="c5", url="", env={})
        with pytest.raises(ConnectionError):
            asyncio.run(client.start())


async def _drive_handshake_and_tools(client: McpHttpClient) -> None:
    await client.start()
    tools = await client.list_tools()
    assert len(tools) == 1
    assert tools[0]["name"] == "search"
    assert tools[0]["inputSchema"] == {"type": "object"}
