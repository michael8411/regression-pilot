"""HTTP/JSON-RPC MCP client (Phase 4).

Implements the same public surface as the stdio `McpClient` so that
`McpRuntime` can swap transports without changing call sites:

    start() / stop() / started / list_tools() / call_tool() / stderr_tail()

The protocol is JSON-RPC 2.0 sent as a POST to the configured URL. Each
request body is a single JSON-RPC envelope; the response body is the
matching JSON-RPC envelope. We handle the standard `initialize` +
`notifications/initialized` handshake followed by `tools/list` and
`tools/call`.

Auth is taken from the `env` dict so we can reuse the encrypted-env
storage the stdio path already uses:

    AUTH_TYPE = "bearer" | "token" | "none"  (default: "none")
    AUTH_TOKEN = "<secret>"

Tokens are never logged.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

import httpx
import structlog


logger = structlog.get_logger("testdeck.mcp.http_client")

_PROTOCOL_VERSION = "2024-11-05"
_CLIENT_INFO = {"name": "testdeck", "version": "0.9.0"}


class McpHttpClient:
    """JSON-RPC over HTTP POST MCP client."""

    def __init__(
        self,
        *,
        connection_id: str,
        url: str,
        env: dict[str, str],
    ) -> None:
        self.connection_id = connection_id
        self._url = url
        self._env = dict(env or {})
        self._next_id = 1
        self._client: Optional[httpx.AsyncClient] = None
        self._handshake_done = False
        self._lock = asyncio.Lock()  # serialize tools/call per connection
        self._last_error_text = ""

    @property
    def started(self) -> bool:
        return self._client is not None and self._handshake_done

    # --- lifecycle -----------------------------------------------------------

    async def start(self) -> None:
        if self._client is not None:
            return
        if not self._url:
            raise ConnectionError("mcp_http_missing_url")

        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=5.0),
            headers=self._build_headers(),
        )
        try:
            await self._request(
                "initialize",
                {
                    "protocolVersion": _PROTOCOL_VERSION,
                    "clientInfo": _CLIENT_INFO,
                    "capabilities": {},
                },
            )
            await self._notify("notifications/initialized", {})
        except Exception:
            await self.stop()
            raise

        self._handshake_done = True
        logger.info(
            "mcp_http_handshake_ok",
            connection_id=self.connection_id,
        )

    async def stop(self) -> None:
        client = self._client
        self._client = None
        self._handshake_done = False
        if client is not None:
            try:
                await client.aclose()
            except Exception:
                pass

    # --- public surface ------------------------------------------------------

    async def list_tools(self) -> list[dict]:
        result = await self._request("tools/list", {})
        if isinstance(result, dict):
            tools = result.get("tools") or []
            if isinstance(tools, list):
                return list(tools)
        return []

    async def call_tool(self, name: str, arguments: Any, *, timeout: float) -> Any:
        async with self._lock:
            return await self._request(
                "tools/call",
                {"name": name, "arguments": arguments or {}},
                timeout=timeout,
            )

    async def stderr_tail(self) -> bytes:
        # HTTP transport has no stderr stream; surface the last error message
        # so the UI has something to display for diagnostics.
        return self._last_error_text.encode("utf-8")[-8192:]

    # --- internals -----------------------------------------------------------

    def _build_headers(self) -> dict[str, str]:
        headers = {
            "content-type": "application/json",
            "accept": "application/json",
        }
        auth_type = (self._env.get("AUTH_TYPE") or "none").strip().lower()
        token = self._env.get("AUTH_TOKEN") or ""
        if not token:
            return headers
        if auth_type == "bearer":
            headers["authorization"] = f"Bearer {token}"
        elif auth_type == "token":
            headers["authorization"] = f"Token {token}"
        return headers

    async def _request(
        self, method: str, params: dict, *, timeout: Optional[float] = None
    ) -> Any:
        if self._client is None:
            raise ConnectionError("mcp_http_not_started")

        msg_id = self._next_id
        self._next_id += 1
        message = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "method": method,
            "params": params,
        }
        try:
            resp = await self._client.post(
                self._url,
                json=message,
                timeout=timeout if timeout is not None else None,
            )
        except httpx.HTTPError as exc:
            self._last_error_text = f"http_error: {type(exc).__name__}"
            raise ConnectionError(self._last_error_text) from exc

        if resp.status_code >= 400:
            self._last_error_text = (
                f"http_status_{resp.status_code}: {resp.text[:200]}"
            )
            raise ConnectionError(self._last_error_text)

        try:
            body = resp.json()
        except ValueError as exc:
            self._last_error_text = f"http_invalid_json: {type(exc).__name__}"
            raise RuntimeError(self._last_error_text) from exc

        if not isinstance(body, dict):
            raise RuntimeError("mcp_http_invalid_response_shape")

        if "error" in body and body.get("error"):
            err = body["error"] or {}
            self._last_error_text = (
                f"rpc_error:{err.get('code')}:{err.get('message')}"
            )
            raise RuntimeError(self._last_error_text)

        return body.get("result")

    async def _notify(self, method: str, params: dict) -> None:
        if self._client is None:
            return
        message = {"jsonrpc": "2.0", "method": method, "params": params}
        try:
            await self._client.post(self._url, json=message, timeout=5.0)
        except httpx.HTTPError:
            # Notifications are fire-and-forget; failures are non-fatal.
            pass
