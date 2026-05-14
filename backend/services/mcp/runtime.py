import asyncio
import os
import time
from pathlib import Path
from typing import Any, Optional

import structlog

try:
    from backend.services.mcp.client import McpClient
    from backend.services.mcp.http_client import McpHttpClient
    from backend.services.mcp.sse_client import McpSseClient
    from backend.services import mcp_connection_service
except ImportError:  # pragma: no cover
    from services.mcp.client import McpClient
    from services.mcp.http_client import McpHttpClient
    from services.mcp.sse_client import McpSseClient
    from services import mcp_connection_service


# Union type — McpRuntime treats all three as the same surface.
McpAnyClient = Any


logger = structlog.get_logger("testdeck.mcp.runtime")

IDLE_TIMEOUT_SECONDS = 600
TOOL_CALL_TIMEOUT_SECONDS = 30
HANDSHAKE_TIMEOUT_SECONDS = 10
GC_INTERVAL_SECONDS = 60


def _idle_status(_: str) -> str:
    return "idle"


def _no_error(_: str) -> Optional[str]:
    return None


class _State:
    __slots__ = (
        "client",
        "tools",
        "tools_fetched_at",
        "last_used",
        "last_error",
    )

    def __init__(self, client: Optional[McpAnyClient]):
        self.client: Optional[McpAnyClient] = client
        self.tools: list[dict] = []
        self.tools_fetched_at: float = 0.0
        self.last_used: float = time.monotonic()
        self.last_error: Optional[str] = None


class McpRuntime:
    def __init__(self, *, data_dir: Path):
        self._data_dir = data_dir
        self._states: dict[str, _State] = {}
        self._spawn_locks: dict[str, asyncio.Lock] = {}
        self._gc_task: Optional[asyncio.Task] = None

    def status_for(self, connection_id: str) -> str:
        st = self._states.get(connection_id)
        if not st:
            return "idle"
        if st.last_error:
            return "error"
        if st.client is not None:
            return "running"
        return "idle"

    def last_error_for(self, connection_id: str) -> Optional[str]:
        st = self._states.get(connection_id)
        return st.last_error if st else None

    async def start(self) -> None:
        if self._gc_task is None or self._gc_task.done():
            self._gc_task = asyncio.create_task(self._gc_loop(), name="mcp-gc")

    async def stop(self) -> None:
        if self._gc_task:
            self._gc_task.cancel()
            try:
                await self._gc_task
            except (asyncio.CancelledError, Exception):
                pass
            self._gc_task = None
        await asyncio.gather(
            *(self._stop_one(cid) for cid in list(self._states)),
            return_exceptions=True,
        )

    async def list_tools(
        self, connection_id: str, *, force_refresh: bool = False
    ) -> list[dict]:
        client = await self._ensure_client(connection_id)
        st = self._states[connection_id]
        if (
            not force_refresh
            and st.tools
            and (time.monotonic() - st.tools_fetched_at) < 60
        ):
            st.last_used = time.monotonic()
            return st.tools
        try:
            tools = await client.list_tools()
        except Exception as e:
            st.last_error = str(e)
            await self._stop_one(connection_id)
            raise
        st.tools = tools
        st.tools_fetched_at = time.monotonic()
        st.last_used = time.monotonic()
        st.last_error = None
        return tools

    async def invoke(
        self, connection_id: str, tool_name: str, arguments: Any
    ) -> Any:
        client = await self._ensure_client(connection_id)
        st = self._states[connection_id]
        st.last_used = time.monotonic()
        try:
            result = await client.call_tool(
                tool_name, arguments, timeout=TOOL_CALL_TIMEOUT_SECONDS
            )
        except Exception as e:
            st.last_error = str(e)
            raise
        st.last_used = time.monotonic()
        st.last_error = None
        return result

    async def test(self, connection_id: str) -> dict:
        await self._stop_one(connection_id)
        start = time.monotonic()
        try:
            client = await self._ensure_client(connection_id)
            tools = await client.list_tools()
            duration_ms = int((time.monotonic() - start) * 1000)
            return {
                "ok": True,
                "toolCount": len(tools),
                "duration_ms": duration_ms,
            }
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            return {
                "ok": False,
                "toolCount": 0,
                "duration_ms": duration_ms,
                "error": str(e),
            }
        finally:
            await self._stop_one(connection_id)

    async def disconnect(self, connection_id: str) -> None:
        await self._stop_one(connection_id)

    async def stderr_tail(self, connection_id: str) -> bytes:
        st = self._states.get(connection_id)
        if not st or st.client is None:
            return b""
        return await st.client.stderr_tail()

    async def _ensure_client(self, connection_id: str) -> McpAnyClient:
        st = self._states.get(connection_id)
        if st and st.client is not None:
            return st.client

        lock = self._spawn_locks.setdefault(connection_id, asyncio.Lock())
        async with lock:
            st = self._states.get(connection_id)
            if st and st.client is not None:
                return st.client

            conn = await mcp_connection_service.get_connection_by_id(
                connection_id,
                runtime_status=_idle_status,
                runtime_errors=_no_error,
            )
            if conn is None:
                raise LookupError(f"mcp_connection_missing:{connection_id}")
            if not conn.enabled:
                raise PermissionError(
                    f"mcp_connection_disabled:{connection_id}"
                )

            transport = getattr(conn, "transport", "stdio") or "stdio"
            client: McpAnyClient
            if transport == "http":
                client = McpHttpClient(
                    connection_id=connection_id,
                    url=conn.url,
                    env=dict(conn.env),
                )
            elif transport == "sse":
                client = McpSseClient(
                    connection_id=connection_id,
                    url=conn.url,
                    env=dict(conn.env),
                )
            else:
                cwd = str(self._data_dir / connection_id)
                client = McpClient(
                    connection_id=connection_id,
                    command=conn.command,
                    args=list(conn.args),
                    env=dict(conn.env),
                    cwd=cwd,
                )
            try:
                await client.start()
            except Exception as e:
                # Record the error in state so the UI can surface it.
                if st is None:
                    st = _State(client=None)
                    self._states[connection_id] = st
                st.client = None
                st.last_error = str(e)
                raise

            new_state = _State(client)
            new_state.last_error = None
            self._states[connection_id] = new_state
            return client

    async def _stop_one(self, connection_id: str) -> None:
        st = self._states.get(connection_id)
        if st is None:
            return
        client = st.client
        st.client = None
        if client is None:
            return
        try:
            await client.stop()
        except Exception as e:
            logger.warning(
                "mcp_stop_failed",
                connection_id=connection_id,
                error=str(e),
            )

    async def _gc_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(GC_INTERVAL_SECONDS)
                cutoff = time.monotonic() - IDLE_TIMEOUT_SECONDS
                stale = [
                    cid
                    for cid, st in self._states.items()
                    if st.client is not None and st.last_used < cutoff
                ]
                for cid in stale:
                    logger.info("mcp_idle_shutdown", connection_id=cid)
                    await self._stop_one(cid)
        except asyncio.CancelledError:
            raise


_runtime_singleton: Optional[McpRuntime] = None


def _default_data_dir() -> Path:
    env_dir = os.environ.get("TESTDECK_MCP_DATA_DIR")
    if env_dir:
        return Path(env_dir)
    return Path.home() / ".testdeck" / "mcp"


def get_runtime() -> McpRuntime:
    global _runtime_singleton
    if _runtime_singleton is None:
        _runtime_singleton = McpRuntime(data_dir=_default_data_dir())
    return _runtime_singleton


def reset_runtime_for_tests() -> None:
    """Reset the singleton — used by tests to inject custom data dirs."""
    global _runtime_singleton
    _runtime_singleton = None
