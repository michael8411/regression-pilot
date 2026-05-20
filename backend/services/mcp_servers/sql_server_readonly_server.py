"""Local read-only SQL Server MCP server (Phase 18).

Exposes a small set of schema-introspection tools only. No arbitrary
queries; no INSERT/UPDATE/DELETE/EXEC; no data sampling.

Run via:
    python -m backend.services.mcp_servers.sql_server_readonly_server

Communicates over stdio as MCP JSON-RPC (newline-delimited). Behavior is
purposely narrow:

  - list_schemas
  - search_tables
  - describe_table
  - list_relationships
  - search_procedures
  - get_procedure_definition

Procedure bodies are truncated to a hard cap. Connection strings are
never written to stdout/stderr.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Optional


PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "sql-server-readonly"
SERVER_VERSION = "0.1.0"

MAX_TABLES = 100
MAX_COLS = 200
MAX_FKS = 80
MAX_INDEXES = 60
MAX_PROCS = 50
MAX_PROC_CHARS = 4_000


# ---------------------------------------------------------------------------
# JSON-RPC framing
# ---------------------------------------------------------------------------


def _write(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, separators=(",", ":"), default=str) + "\n")
    sys.stdout.flush()


def _respond(msg_id: Any, result: Any) -> None:
    _write({"jsonrpc": "2.0", "id": msg_id, "result": result})


def _error(msg_id: Any, code: int, message: str) -> None:
    _write(
        {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {"code": code, "message": message},
        }
    )


# ---------------------------------------------------------------------------
# Tool descriptors
# ---------------------------------------------------------------------------

TOOLS: list[dict] = [
    {
        "name": "list_schemas",
        "description": "List database schemas visible to the read-only account.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "search_tables",
        "description": "Search tables by partial name match. Returns up to 'limit' rows.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "describe_table",
        "description": "Return columns, primary key, foreign keys, and indexes for a table.",
        "inputSchema": {
            "type": "object",
            "properties": {"table": {"type": "string"}},
            "required": ["table"],
        },
    },
    {
        "name": "list_relationships",
        "description": "List foreign-key relationships for a given table.",
        "inputSchema": {
            "type": "object",
            "properties": {"table": {"type": "string"}},
            "required": ["table"],
        },
    },
    {
        "name": "search_procedures",
        "description": "Search stored procedures by partial name match.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_procedure_definition",
        "description": "Return a stored procedure's definition. Output is hard-capped.",
        "inputSchema": {
            "type": "object",
            "properties": {"procedure": {"type": "string"}},
            "required": ["procedure"],
        },
    },
]


# ---------------------------------------------------------------------------
# Connection / SQL helpers — pyodbc + Phase 16 settings
# ---------------------------------------------------------------------------


class SqlServerUnavailable(RuntimeError):
    pass


def _settings():
    try:
        from backend.config.settings import get_settings
    except ImportError:  # pragma: no cover
        from config.settings import get_settings
    return get_settings()


def _connect():
    s = _settings()
    if not s.sql_server_connection_string:
        raise SqlServerUnavailable("sql server not configured")
    try:
        import pyodbc  # noqa: PLC0415
    except ImportError as exc:
        raise SqlServerUnavailable(
            "pyodbc not installed — install pyodbc>=5.0 and ODBC driver"
        ) from exc
    try:
        conn = pyodbc.connect(s.sql_server_connection_string, timeout=10)
        conn.timeout = 10
        return conn
    except Exception as exc:
        # Defensive: never include the connection string in errors.
        raise SqlServerUnavailable(f"connection failed: {type(exc).__name__}") from exc


def _split_qualified(name: str) -> tuple[str, str]:
    """Return (schema, bare) from 'dbo.TimeCard' or 'TimeCard'."""
    if "." in name:
        schema, bare = name.split(".", 1)
        return schema.strip(), bare.strip()
    return "", name.strip()


def _allowed_schemas() -> list[str]:
    raw = _settings().sql_server_schema_allowlist or "dbo"
    return [s.strip() for s in raw.split(",") if s.strip()]


def _placeholders(items: list) -> str:
    return ",".join("?" * len(items))


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


def tool_list_schemas() -> dict:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sys.schemas ORDER BY name")
        allowed = set(_allowed_schemas())
        return {
            "schemas": [
                row[0] for row in cur.fetchall() if not allowed or row[0] in allowed
            ]
        }
    finally:
        conn.close()


def tool_search_tables(query: str, limit: int = 25) -> dict:
    if not query or not query.strip():
        return {"tables": []}
    limit = max(1, min(int(limit or 25), MAX_TABLES))
    schemas = _allowed_schemas()
    ph = _placeholders(schemas)
    like = f"%{query.strip()}%"
    sql = (
        "SELECT TOP (?) s.name, t.name "
        "FROM sys.tables t "
        "JOIN sys.schemas s ON t.schema_id = s.schema_id "
        f"WHERE s.name IN ({ph}) AND t.name LIKE ? "
        "ORDER BY s.name, t.name"
    )
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(sql, [limit, *schemas, like])
        rows = cur.fetchall()
        return {
            "tables": [
                {
                    "name": f"{row[0]}.{row[1]}",
                    "schema": row[0],
                    "table": row[1],
                    "matched_on": ["name"],
                }
                for row in rows
            ]
        }
    finally:
        conn.close()


def tool_describe_table(table: str) -> dict:
    schema, bare = _split_qualified(table)
    allowed = _allowed_schemas()
    if schema and schema not in allowed:
        raise PermissionError(f"schema_not_allowed:{schema}")
    schemas = [schema] if schema else allowed
    ph_s = _placeholders(schemas)
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            (
                "SELECT TOP (?) s.name, t.name, c.name, ty.name, c.is_nullable, "
                "c.max_length, c.is_identity "
                "FROM sys.columns c "
                "JOIN sys.tables t ON c.object_id = t.object_id "
                "JOIN sys.schemas s ON t.schema_id = s.schema_id "
                "JOIN sys.types ty ON c.user_type_id = ty.user_type_id "
                f"WHERE s.name IN ({ph_s}) AND t.name = ? "
                "ORDER BY s.name, t.name, c.column_id"
            ),
            [MAX_COLS, *schemas, bare],
        )
        col_rows = cur.fetchall()
        if not col_rows:
            return {"table": table, "columns": [], "primary_key": [], "foreign_keys": [], "indexes": []}

        cur.execute(
            (
                "SELECT TOP (?) c.name "
                "FROM sys.indexes i "
                "JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id "
                "JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id "
                "JOIN sys.tables t ON i.object_id = t.object_id "
                f"WHERE i.is_primary_key = 1 AND t.name = ?"
            ),
            [MAX_COLS, bare],
        )
        pk = [r[0] for r in cur.fetchall()]

        fks = _query_fks(cur, schemas, [bare])
        idx = _query_indexes(cur, schemas, [bare])

        return {
            "table": f"{col_rows[0][0]}.{col_rows[0][1]}",
            "columns": [
                {
                    "name": r[2],
                    "type": r[3],
                    "nullable": bool(r[4]),
                    "max_length": int(r[5]) if r[5] is not None else None,
                    "is_identity": bool(r[6]),
                    "is_primary_key": r[2] in pk,
                }
                for r in col_rows
            ],
            "primary_key": pk,
            "foreign_keys": fks[:MAX_FKS],
            "indexes": idx[:MAX_INDEXES],
        }
    finally:
        conn.close()


def tool_list_relationships(table: str) -> dict:
    schema, bare = _split_qualified(table)
    allowed = _allowed_schemas()
    if schema and schema not in allowed:
        raise PermissionError(f"schema_not_allowed:{schema}")
    schemas = [schema] if schema else allowed
    conn = _connect()
    try:
        cur = conn.cursor()
        fks = _query_fks(cur, schemas, [bare])
        return {"foreign_keys": fks[:MAX_FKS]}
    finally:
        conn.close()


def tool_search_procedures(query: str, limit: int = 25) -> dict:
    if not query or not query.strip():
        return {"procedures": []}
    limit = max(1, min(int(limit or 25), MAX_PROCS))
    schemas = _allowed_schemas()
    ph = _placeholders(schemas)
    like = f"%{query.strip()}%"
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            (
                "SELECT TOP (?) s.name, o.name "
                "FROM sys.objects o "
                "JOIN sys.schemas s ON o.schema_id = s.schema_id "
                f"WHERE o.type = 'P' AND s.name IN ({ph}) AND o.name LIKE ? "
                "ORDER BY s.name, o.name"
            ),
            [limit, *schemas, like],
        )
        return {
            "procedures": [
                {"name": f"{row[0]}.{row[1]}", "schema": row[0]}
                for row in cur.fetchall()
            ]
        }
    finally:
        conn.close()


def tool_get_procedure_definition(procedure: str) -> dict:
    schema, bare = _split_qualified(procedure)
    allowed = _allowed_schemas()
    if schema and schema not in allowed:
        raise PermissionError(f"schema_not_allowed:{schema}")
    schemas = [schema] if schema else allowed
    ph_s = _placeholders(schemas)
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            (
                "SELECT TOP 1 s.name, o.name, m.definition "
                "FROM sys.sql_modules m "
                "JOIN sys.objects o ON m.object_id = o.object_id "
                "JOIN sys.schemas s ON o.schema_id = s.schema_id "
                f"WHERE o.type = 'P' AND s.name IN ({ph_s}) AND o.name = ?"
            ),
            [*schemas, bare],
        )
        row = cur.fetchone()
        if not row:
            return {"procedure": procedure, "definition": "", "found": False}
        definition = (row[2] or "")
        truncated = len(definition) > MAX_PROC_CHARS
        return {
            "procedure": f"{row[0]}.{row[1]}",
            "definition": definition[:MAX_PROC_CHARS],
            "truncated": truncated,
            "original_size_chars": len(definition),
            "found": True,
        }
    finally:
        conn.close()


def _query_fks(cur, schemas: list[str], table_names: list[str]) -> list[dict]:
    if not table_names:
        return []
    ph_s = _placeholders(schemas)
    ph_t = _placeholders(table_names)
    cur.execute(
        (
            "SELECT fk.name, s1.name, t1.name, c1.name, s2.name, t2.name, c2.name "
            "FROM sys.foreign_keys fk "
            "JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id "
            "JOIN sys.tables t1 ON fkc.parent_object_id = t1.object_id "
            "JOIN sys.schemas s1 ON t1.schema_id = s1.schema_id "
            "JOIN sys.tables t2 ON fkc.referenced_object_id = t2.object_id "
            "JOIN sys.schemas s2 ON t2.schema_id = s2.schema_id "
            "JOIN sys.columns c1 ON fkc.parent_object_id = c1.object_id AND fkc.parent_column_id = c1.column_id "
            "JOIN sys.columns c2 ON fkc.referenced_object_id = c2.object_id AND fkc.referenced_column_id = c2.column_id "
            f"WHERE s1.name IN ({ph_s}) AND t1.name IN ({ph_t}) "
            "ORDER BY fk.name"
        ),
        [*schemas, *table_names],
    )
    return [
        {
            "name": row[0],
            "from_table": f"{row[1]}.{row[2]}",
            "from_column": row[3],
            "to_table": f"{row[4]}.{row[5]}",
            "to_column": row[6],
        }
        for row in cur.fetchall()
    ]


def _query_indexes(cur, schemas: list[str], table_names: list[str]) -> list[dict]:
    if not table_names:
        return []
    ph_s = _placeholders(schemas)
    ph_t = _placeholders(table_names)
    cur.execute(
        (
            "SELECT i.object_id, i.index_id, i.name, s.name, t.name, i.is_unique, i.is_primary_key "
            "FROM sys.indexes i "
            "JOIN sys.tables t ON i.object_id = t.object_id "
            "JOIN sys.schemas s ON t.schema_id = s.schema_id "
            f"WHERE s.name IN ({ph_s}) AND t.name IN ({ph_t}) AND i.name IS NOT NULL"
        ),
        [*schemas, *table_names],
    )
    return [
        {
            "name": r[2],
            "table": f"{r[3]}.{r[4]}",
            "unique": bool(r[5]),
            "primary_key": bool(r[6]),
        }
        for r in cur.fetchall()
    ]


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


_DISPATCH = {
    "list_schemas": lambda args: tool_list_schemas(),
    "search_tables": lambda args: tool_search_tables(args.get("query", ""), args.get("limit", 25)),
    "describe_table": lambda args: tool_describe_table(args.get("table", "")),
    "list_relationships": lambda args: tool_list_relationships(args.get("table", "")),
    "search_procedures": lambda args: tool_search_procedures(args.get("query", ""), args.get("limit", 25)),
    "get_procedure_definition": lambda args: tool_get_procedure_definition(args.get("procedure", "")),
}


def _handle_call(name: str, arguments: Optional[dict]) -> Any:
    fn = _DISPATCH.get(name)
    if fn is None:
        raise ValueError(f"unknown_tool:{name}")
    return fn(arguments or {})


def main() -> int:
    for raw in sys.stdin:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(msg, dict):
            continue
        method = msg.get("method")
        msg_id = msg.get("id")

        if method == "initialize":
            _respond(
                msg_id,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
                    "capabilities": {},
                },
            )
        elif method == "notifications/initialized":
            continue
        elif method == "tools/list":
            _respond(msg_id, {"tools": TOOLS})
        elif method == "tools/call":
            params = msg.get("params") or {}
            tool_name = str(params.get("name", ""))
            args = params.get("arguments") or {}
            try:
                result = _handle_call(tool_name, args)
                _respond(msg_id, result)
            except SqlServerUnavailable as exc:
                _error(msg_id, -32000, f"sql_server_unavailable:{exc}")
            except PermissionError as exc:
                _error(msg_id, -32001, str(exc))
            except ValueError as exc:
                _error(msg_id, -32602, str(exc))
            except Exception as exc:
                # Never echo the underlying SQL error text — it can leak metadata.
                _error(msg_id, -32603, f"sql_error:{type(exc).__name__}")
        else:
            if msg_id is not None:
                _error(msg_id, -32601, "method not found")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
