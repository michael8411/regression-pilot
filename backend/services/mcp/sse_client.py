"""SSE MCP client placeholder (Phase 4, feature-flagged).

SSE transport requires bi-directional flow (POST for requests, GET for
the server -> client event stream) and per-server quirks around session
handshake. Shipping it now would risk silent breakage; instead this
client refuses to start with a clear error so the UI can surface that
SSE is enabled but not yet implemented in this build. The flag
`MCP_TRANSPORT_SSE_ENABLED` env var can be set to opt in to a future
real implementation when it lands.
"""

from __future__ import annotations

import os
from typing import Any

import structlog


logger = structlog.get_logger("testdeck.mcp.sse_client")


class McpSseClient:
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
        self._started = False
        self._last_error_text = ""

    @property
    def started(self) -> bool:
        return self._started

    async def start(self) -> None:
        if not os.environ.get("MCP_TRANSPORT_SSE_ENABLED"):
            self._last_error_text = (
                "SSE transport is not yet supported in this build. "
                "Set MCP_TRANSPORT_SSE_ENABLED=1 once the implementation lands."
            )
            logger.info(
                "mcp_sse_disabled",
                connection_id=self.connection_id,
            )
            raise ConnectionError(self._last_error_text)
        # Reserved for the future real implementation.
        raise ConnectionError("mcp_sse_not_implemented")

    async def stop(self) -> None:
        self._started = False

    async def list_tools(self) -> list[dict]:
        raise ConnectionError("mcp_sse_not_implemented")

    async def call_tool(
        self, name: str, arguments: Any, *, timeout: float
    ) -> Any:
        raise ConnectionError("mcp_sse_not_implemented")

    async def stderr_tail(self) -> bytes:
        return self._last_error_text.encode("utf-8")[-8192:]
