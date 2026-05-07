import asyncio
import os
import sys
from collections import deque
from typing import Any, Optional

import structlog

try:
    from backend.services.mcp.transport import FrameError, decode, encode
except ImportError:  # pragma: no cover
    from services.mcp.transport import FrameError, decode, encode


logger = structlog.get_logger("testdeck.mcp.client")

# Whitelisted env vars that always pass to the child.
_INHERITED_ENV_KEYS = {
    "PATH",
    "HOME",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERNAME",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMDATA",
    "WINDIR",
}

_PROTOCOL_VERSION = "2024-11-05"
_CLIENT_INFO = {"name": "testdeck", "version": "0.9.0"}
_HANDSHAKE_TIMEOUT_SECONDS = 10.0


class McpClient:
    def __init__(
        self,
        *,
        connection_id: str,
        command: str,
        args: list[str],
        env: dict[str, str],
        cwd: str,
    ):
        self.connection_id = connection_id
        self._command = command
        self._args = list(args)
        self._env = dict(env)
        self._cwd = cwd

        self._proc: Optional[asyncio.subprocess.Process] = None
        self._next_id = 1
        self._pending: dict[int, asyncio.Future[Any]] = {}
        self._reader_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None
        # 8KB cap: 8 * 1024 / 1024 = 8 chunks of 1024 bytes
        self._stderr_buffer: deque[bytes] = deque(maxlen=8)
        self._stderr_lock = asyncio.Lock()
        self._handshake_done = False
        self._lock = asyncio.Lock()  # serialize tools/call per connection

    @property
    def started(self) -> bool:
        return self._proc is not None and self._handshake_done

    async def start(self) -> None:
        if self._proc is not None:
            return

        env = self._build_child_env()
        os.makedirs(self._cwd, exist_ok=True)

        kwargs: dict[str, Any] = dict(
            cwd=self._cwd,
            env=env,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        if sys.platform == "win32":
            kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW

        self._proc = await asyncio.create_subprocess_exec(
            self._command, *self._args, **kwargs
        )

        self._reader_task = asyncio.create_task(
            self._read_loop(), name=f"mcp-stdout-{self.connection_id}"
        )
        self._stderr_task = asyncio.create_task(
            self._stderr_loop(), name=f"mcp-stderr-{self.connection_id}"
        )

        try:
            await self._handshake()
        except Exception:
            await self.stop()
            raise

    def _build_child_env(self) -> dict[str, str]:
        passthrough = {
            k: v
            for k, v in os.environ.items()
            if k.upper() in _INHERITED_ENV_KEYS
        }
        # User-supplied env overrides inherited values intentionally.
        passthrough.update(self._env)
        return passthrough

    async def _handshake(self) -> None:
        result = await self._request(
            "initialize",
            {
                "protocolVersion": _PROTOCOL_VERSION,
                "clientInfo": _CLIENT_INFO,
                "capabilities": {},
            },
            timeout=_HANDSHAKE_TIMEOUT_SECONDS,
        )
        await self._notify("notifications/initialized", {})
        self._handshake_done = True
        server_name = ""
        if isinstance(result, dict):
            info = result.get("serverInfo") or {}
            if isinstance(info, dict):
                server_name = str(info.get("name") or "")
        logger.info(
            "mcp_handshake_ok",
            connection_id=self.connection_id,
            server=server_name or "unknown",
        )

    async def list_tools(self) -> list[dict]:
        result = await self._request("tools/list", {}, timeout=10.0)
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

    async def stop(self) -> None:
        if self._proc is None:
            return
        proc = self._proc
        self._proc = None
        try:
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
                try:
                    await asyncio.wait_for(proc.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass
        finally:
            for task in (self._reader_task, self._stderr_task):
                if task and not task.done():
                    task.cancel()
            self._reader_task = None
            self._stderr_task = None
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(ConnectionError("mcp_client_closed"))
            self._pending.clear()
            self._handshake_done = False

    async def stderr_tail(self) -> bytes:
        async with self._stderr_lock:
            return b"".join(self._stderr_buffer)[-8192:]

    async def _request(
        self, method: str, params: dict, *, timeout: float
    ) -> Any:
        if self._proc is None or self._proc.stdin is None:
            raise ConnectionError("mcp_client_not_started")

        msg_id = self._next_id
        self._next_id += 1
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[Any] = loop.create_future()
        self._pending[msg_id] = fut

        message = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "method": method,
            "params": params,
        }
        try:
            self._proc.stdin.write(encode(message))
            await self._proc.stdin.drain()
        except (BrokenPipeError, ConnectionResetError) as e:
            self._pending.pop(msg_id, None)
            raise ConnectionError(f"mcp_pipe_broken: {e}") from e

        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending.pop(msg_id, None)
            raise TimeoutError(f"mcp_request_timeout:{method}") from None

    async def _notify(self, method: str, params: dict) -> None:
        if self._proc is None or self._proc.stdin is None:
            return
        message = {"jsonrpc": "2.0", "method": method, "params": params}
        try:
            self._proc.stdin.write(encode(message))
            await self._proc.stdin.drain()
        except (BrokenPipeError, ConnectionResetError):
            pass

    async def _read_loop(self) -> None:
        assert self._proc is not None and self._proc.stdout is not None
        stdout = self._proc.stdout
        try:
            while True:
                line = await stdout.readline()
                if not line:
                    break
                try:
                    msg = decode(line)
                except FrameError as e:
                    logger.warning(
                        "mcp_decode_failed",
                        connection_id=self.connection_id,
                        error=str(e),
                    )
                    continue
                msg_id = msg.get("id")
                if msg_id is None:
                    # notification from server, ignore
                    continue
                fut = self._pending.pop(msg_id, None)
                if fut is None or fut.done():
                    continue
                if "error" in msg:
                    err = msg.get("error") or {}
                    fut.set_exception(
                        RuntimeError(
                            f"mcp_rpc_error:{err.get('code')}:{err.get('message')}"
                        )
                    )
                else:
                    fut.set_result(msg.get("result"))
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(
                "mcp_reader_crashed",
                connection_id=self.connection_id,
                error=str(e),
            )
        finally:
            for fut in list(self._pending.values()):
                if not fut.done():
                    fut.set_exception(ConnectionError("mcp_stream_closed"))
            self._pending.clear()

    async def _stderr_loop(self) -> None:
        assert self._proc is not None and self._proc.stderr is not None
        stderr = self._proc.stderr
        try:
            while True:
                chunk = await stderr.read(1024)
                if not chunk:
                    break
                async with self._stderr_lock:
                    self._stderr_buffer.append(chunk)
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
