"""Guardrail tests for the read-only SQL Server MCP server.

We do NOT hit a real SQL Server here. Tests assert:
  - The tool list contains the expected names (schema-only).
  - Calling without configuration returns the unavailable error.
  - Procedure-definition truncation honors the cap.
  - Block-listed schema names raise PermissionError.
"""

import importlib
import io
import json
import sys


def _reload():
    sys.modules.pop(
        "services.mcp_servers.sql_server_readonly_server", None
    )
    return importlib.import_module(
        "services.mcp_servers.sql_server_readonly_server"
    )


def test_tools_list_contains_schema_tools_only():
    mod = _reload()
    names = {t["name"] for t in mod.TOOLS}
    assert names == {
        "list_schemas",
        "search_tables",
        "describe_table",
        "list_relationships",
        "search_procedures",
        "get_procedure_definition",
    }


def test_unconfigured_sql_raises_unavailable(monkeypatch, fake_keyring):
    from config.settings import get_settings

    get_settings.cache_clear()
    s = get_settings()
    monkeypatch.setattr(s, "sql_server_connection_string", "", raising=False)

    mod = _reload()
    import pytest

    with pytest.raises(mod.SqlServerUnavailable):
        mod._connect()


def test_split_qualified_handles_dotted_and_bare():
    mod = _reload()
    assert mod._split_qualified("dbo.TimeCard") == ("dbo", "TimeCard")
    assert mod._split_qualified("TimeCard") == ("", "TimeCard")


def test_block_disallowed_schema_in_describe(monkeypatch, fake_keyring):
    from config.settings import get_settings

    get_settings.cache_clear()
    s = get_settings()
    monkeypatch.setattr(
        s,
        "sql_server_connection_string",
        "Driver={ODBC Driver 17 for SQL Server};Server=x;",
        raising=False,
    )
    monkeypatch.setattr(s, "sql_server_schema_allowlist", "dbo", raising=False)

    mod = _reload()
    import pytest

    with pytest.raises(PermissionError):
        mod.tool_describe_table("other.SecretTable")


def test_procedure_definition_truncation(monkeypatch):
    mod = _reload()

    # Stub _connect to avoid touching real pyodbc.
    class _FakeCursor:
        def __init__(self):
            self._next = None

        def execute(self, *a, **kw):
            self._next = ("dbo", "Big", "X" * (mod.MAX_PROC_CHARS * 3))

        def fetchone(self):
            return self._next

    class _FakeConn:
        def cursor(self):
            return _FakeCursor()

        def close(self):
            pass

    monkeypatch.setattr(mod, "_connect", lambda: _FakeConn())
    monkeypatch.setattr(mod, "_allowed_schemas", lambda: ["dbo"])

    out = mod.tool_get_procedure_definition("dbo.Big")
    assert out["truncated"] is True
    assert len(out["definition"]) == mod.MAX_PROC_CHARS


def test_dispatch_routes_known_tool(monkeypatch):
    mod = _reload()
    monkeypatch.setattr(mod, "tool_list_schemas", lambda: {"schemas": ["dbo"]})
    out = mod._handle_call("list_schemas", {})
    assert out == {"schemas": ["dbo"]}


def test_dispatch_unknown_tool_raises():
    mod = _reload()
    import pytest

    with pytest.raises(ValueError):
        mod._handle_call("not_a_tool", {})
