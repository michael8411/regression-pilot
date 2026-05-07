"""A minimal MCP-compatible stdio server for tests.

Run with `python -m tests.fixtures.echo_mcp`.

Behavior:
- Responds to `initialize` with a fake server identity.
- Responds to `tools/list` with one tool named `echo`.
- Responds to `tools/call` with `{"content": <arguments>}`.
- Notifications (no `id`) are accepted silently.
- Unknown methods return a JSON-RPC method-not-found error.

Optional env-driven behavior, used by security tests:
- `ECHO_FAIL_HANDSHAKE=1` — exit with code 7 before responding to initialize.
- `ECHO_DUMP_ENV=1` — write all env vars (one per line) to stderr at startup.
- `ECHO_HANG_TOOL=1` — never respond to tools/call (hangs forever).
- `ECHO_DUMP_ARGV=1` — write argv (one per line) to stderr at startup.
"""

from __future__ import annotations

import json
import os
import sys
import time


def _write(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _err(line: str) -> None:
    sys.stderr.write(line + "\n")
    sys.stderr.flush()


def _respond(msg_id, result) -> None:
    _write({"jsonrpc": "2.0", "id": msg_id, "result": result})


def _error(msg_id, code: int, message: str) -> None:
    _write(
        {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {"code": code, "message": message},
        }
    )


def main() -> int:
    if os.environ.get("ECHO_DUMP_ENV") == "1":
        for k in sorted(os.environ):
            _err(f"ENV {k}={os.environ[k]}")
    if os.environ.get("ECHO_DUMP_ARGV") == "1":
        for a in sys.argv:
            _err(f"ARGV {a}")
    if os.environ.get("ECHO_FAIL_HANDSHAKE") == "1":
        _err("intentional handshake failure")
        return 7

    for raw in sys.stdin:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue

        method = msg.get("method")
        msg_id = msg.get("id")

        if method == "initialize":
            _respond(
                msg_id,
                {
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {"name": "echo", "version": "0.0.1"},
                    "capabilities": {},
                },
            )
        elif method == "notifications/initialized":
            continue
        elif method == "tools/list":
            _respond(
                msg_id,
                {
                    "tools": [
                        {
                            "name": "echo",
                            "description": "echoes input",
                            "inputSchema": {"type": "object"},
                        }
                    ]
                },
            )
        elif method == "tools/call":
            if os.environ.get("ECHO_HANG_TOOL") == "1":
                # Block forever — exercised by the timeout test.
                while True:
                    time.sleep(60)
            params = msg.get("params") or {}
            args = params.get("arguments")
            _respond(msg_id, {"content": args if args is not None else {}})
        else:
            if msg_id is not None:
                _error(msg_id, -32601, "method not found")

    return 0


if __name__ == "__main__":
    sys.exit(main())
