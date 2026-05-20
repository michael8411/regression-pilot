"""SQL Server schema-context adapter.

Queries metadata-only system views (sys.*). Never runs arbitrary SQL, never
samples table data, never logs connection strings or result payloads.

Requires: Microsoft ODBC Driver 17 or 18 for SQL Server + pyodbc>=5.0.0.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog

from .base import AdapterUnavailable, SqlServerAdapter

try:
    from backend.schemas.context_bundle_models import DbContext, TableSchema
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import DbContext, TableSchema

logger = structlog.get_logger("testdeck.sql_server_adapter")

_MAX_TABLES = 8
_MAX_COLS_PER_TABLE = 80
_MAX_FKS = 40
_MAX_INDEXES = 40
_MAX_PROCS = 5
_MAX_PROC_CHARS = 2000
_QUERY_TIMEOUT = 10  # seconds


# ----------------------------------------------------------------------------
# Error sanitization
# ----------------------------------------------------------------------------

# Maps the suffix portion of an ODBC SQLSTATE / driver message keyword to a
# safe short code. Matching is keyword-only — raw exception text is NEVER
# returned to callers or logs.
_LOGIN_KEYWORDS = (
    "login failed",
    "cannot open database",  # appears in login-time db pin failures too
    "authentication",
    "permission denied to login",
)
_DB_KEYWORDS = (
    "cannot open database",
    "does not exist",
    "is not a valid name",
)
_METADATA_KEYWORDS = (
    "permission was denied",
    "select permission",
    "view definition",
    "principal can only access",
)
_NETWORK_KEYWORDS = (
    "timeout",
    "tcp provider",
    "named pipes provider",
    "ssl provider",
    "communication link failure",
    "could not open a connection",
    "host not found",
    "no such host",
    "network-related",
    "connection forcibly closed",
)


def _classify_pyodbc_error(exc: Exception) -> tuple[str, str]:
    """Return (error_code, safe_message) for an ODBC-layer exception.

    Inspects the exception text for known driver phrases. Never returns the
    raw text — only category-derived safe summaries.
    """
    text = str(exc).lower()
    # Login failures take precedence: an auth issue may also mention "cannot
    # open database" because the server short-circuits the db check on a
    # rejected login.
    if any(k in text for k in _LOGIN_KEYWORDS):
        return ("login_failed", "Login failed. Check the connection string credentials.")
    if any(k in text for k in _DB_KEYWORDS):
        return (
            "database_unavailable",
            "The database in the connection string was not found or is not accessible.",
        )
    if any(k in text for k in _METADATA_KEYWORDS):
        return (
            "metadata_permission_denied",
            "Connected, but the account cannot read schema metadata. Grant VIEW DEFINITION or use a read-only account with metadata access.",
        )
    if any(k in text for k in _NETWORK_KEYWORDS):
        return (
            "connection_failed",
            "Connection failed. Verify the server is reachable and the connection string is correct.",
        )
    return ("unknown_error", "Could not connect to SQL Server. Check the connection string and ODBC driver.")


# ----------------------------------------------------------------------------
# Driver discovery
# ----------------------------------------------------------------------------

_SQL_SERVER_DRIVER_HINTS = (
    "odbc driver 18 for sql server",
    "odbc driver 17 for sql server",
    "sql server",  # generic last-resort match
)


def _detect_sql_server_driver() -> tuple[bool, list[str]]:
    """Return (driver_present, all_drivers).

    `pyodbc` import errors are propagated as `ImportError` so the caller can
    map them to the `pyodbc_missing` code.
    """
    import pyodbc  # noqa: PLC0415

    drivers = [str(d) for d in pyodbc.drivers()]
    lower = [d.lower() for d in drivers]
    for hint in _SQL_SERVER_DRIVER_HINTS:
        if any(hint in d for d in lower):
            return True, drivers
    return False, drivers


# ----------------------------------------------------------------------------
# Allowlist helpers (shared with diagnostics and adapter)
# ----------------------------------------------------------------------------


def _parse_csv(value: str) -> list[str]:
    return [x.strip() for x in (value or "").split(",") if x.strip()]


def _bare_name(qualified: str) -> str:
    """Strip schema prefix: 'dbo.TimeCard' -> 'TimeCard'."""
    return qualified.split(".")[-1]


def filter_inferred_tables_by_allowlist(
    inferred: list[str],
    *,
    table_allowlist: list[str],
) -> list[str]:
    """Apply the table allowlist case-insensitively at inference time.

    Compares both bare names and schema-qualified names against the
    allowlist. Returns an empty list when the allowlist filters everything
    out — callers should treat that as a metadata warning, not an error.
    """
    if not table_allowlist:
        return list(inferred)
    al_bare = {n.split(".")[-1].lower() for n in table_allowlist}
    al_full = {n.lower() for n in table_allowlist if "." in n}
    out: list[str] = []
    for name in inferred:
        if name.lower() in al_full or name.split(".")[-1].lower() in al_bare:
            out.append(name)
    return out


# ----------------------------------------------------------------------------
# Diagnostics
# ----------------------------------------------------------------------------


def _empty_diagnostics() -> dict:
    return {
        "ok": False,
        "configured": False,
        "database": None,
        "driver_detected": False,
        "connection_ok": False,
        "metadata_ok": False,
        "accessible_schemas": [],
        "table_count": 0,
        "error_code": "",
        "error_message": "",
    }


def _diagnostic_log(code: str, **extra: Any) -> None:
    """Structured log without secrets — code + class only."""
    logger.info("sql_server_diagnostic", code=code, **extra)


async def diagnose_sql_server() -> dict:
    """Run a safe, layered readiness check.

    The output is the public contract documented in the SQL Server settings
    UI. It is safe to return to the UI: no connection strings, passwords, or
    raw driver text are ever included.
    """
    return await asyncio.to_thread(_diagnose_sync)


def _diagnose_sync() -> dict:
    diag = _empty_diagnostics()

    try:
        from backend.config.settings import get_settings
    except ImportError:  # pragma: no cover
        from config.settings import get_settings

    s = get_settings()
    if not s.sql_server_connection_string:
        diag["error_code"] = "not_configured"
        diag["error_message"] = "SQL Server is not configured."
        _diagnostic_log("not_configured")
        return diag

    diag["configured"] = True
    diag["database"] = s.sql_server_database or None

    # 1) pyodbc available?
    try:
        import pyodbc  # noqa: PLC0415, F401
    except ImportError:
        diag["error_code"] = "pyodbc_missing"
        diag["error_message"] = "pyodbc is not installed in the backend environment."
        _diagnostic_log("pyodbc_missing")
        return diag

    # 2) ODBC SQL Server driver visible?
    try:
        driver_present, _drivers = _detect_sql_server_driver()
    except Exception:
        # If pyodbc.drivers() itself blows up, classify it as a driver issue.
        driver_present = False

    diag["driver_detected"] = driver_present
    if not driver_present:
        diag["error_code"] = "odbc_driver_missing"
        diag["error_message"] = "No SQL Server ODBC driver was detected. Install Microsoft ODBC Driver 18 or 17."
        _diagnostic_log("odbc_driver_missing")
        return diag

    # 3) Connection — try to open the connection.
    import pyodbc  # noqa: PLC0415

    conn = None
    try:
        conn = pyodbc.connect(s.sql_server_connection_string, timeout=_QUERY_TIMEOUT)
        conn.timeout = _QUERY_TIMEOUT
    except pyodbc.Error as exc:
        code, message = _classify_pyodbc_error(exc)
        # Login-time exceptions live under "connection" semantics for the UI.
        diag["error_code"] = code
        diag["error_message"] = message
        _diagnostic_log(code, layer="connect", error_class=type(exc).__name__)
        return diag
    except Exception as exc:
        diag["error_code"] = "connection_failed"
        diag["error_message"] = "Connection failed."
        _diagnostic_log("connection_failed", layer="connect", error_class=type(exc).__name__)
        return diag

    diag["connection_ok"] = True

    # 4) Metadata access — schemas, then table count under the allowlist.
    allowed_schemas_raw = _parse_csv(s.sql_server_schema_allowlist) or ["dbo"]
    allowed_lower = {x.lower() for x in allowed_schemas_raw}
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sys.schemas ORDER BY name")
        all_schemas = [str(r[0]) for r in cursor.fetchall()]
    except Exception as exc:
        code, message = _classify_pyodbc_error(exc)
        # If the user can connect but not even read sys.schemas, treat as
        # metadata_permission_denied unless the classifier picked something
        # more specific.
        if code == "unknown_error":
            code, message = (
                "metadata_permission_denied",
                "Connected, but metadata views could not be read.",
            )
        diag["error_code"] = code
        diag["error_message"] = message
        _diagnostic_log(code, layer="metadata_schemas", error_class=type(exc).__name__)
        _safe_close(conn)
        return diag

    accessible = [s_name for s_name in all_schemas if s_name.lower() in allowed_lower]
    diag["accessible_schemas"] = accessible

    if not accessible:
        diag["error_code"] = "schema_allowlist_empty"
        diag["error_message"] = (
            "The configured schema allowlist does not match any visible schema on this server."
        )
        _diagnostic_log("schema_allowlist_empty")
        _safe_close(conn)
        return diag

    try:
        cursor = conn.cursor()
        placeholders = ",".join("?" * len(accessible))
        cursor.execute(
            "SELECT COUNT(*) FROM sys.tables t "
            "JOIN sys.schemas s ON t.schema_id = s.schema_id "
            f"WHERE s.name IN ({placeholders})",
            accessible,
        )
        row = cursor.fetchone()
        table_count = int(row[0]) if row else 0
    except Exception as exc:
        code, message = _classify_pyodbc_error(exc)
        if code == "unknown_error":
            code, message = (
                "metadata_permission_denied",
                "Connected, but metadata views could not be read.",
            )
        diag["error_code"] = code
        diag["error_message"] = message
        _diagnostic_log(code, layer="metadata_tables", error_class=type(exc).__name__)
        _safe_close(conn)
        return diag

    diag["metadata_ok"] = True
    diag["table_count"] = table_count

    table_allowlist = _parse_csv(s.sql_server_table_allowlist)
    if table_allowlist and table_count > 0:
        # We don't fetch every table to verify — only check that *some* row
        # in the allowed schemas matches an entry in the allowlist (bare or
        # schema-qualified, case-insensitive).
        try:
            cursor = conn.cursor()
            placeholders = ",".join("?" * len(accessible))
            cursor.execute(
                "SELECT s.name, t.name FROM sys.tables t "
                "JOIN sys.schemas s ON t.schema_id = s.schema_id "
                f"WHERE s.name IN ({placeholders})",
                accessible,
            )
            allowed_bare = {n.split(".")[-1].lower() for n in table_allowlist}
            allowed_full = {n.lower() for n in table_allowlist if "." in n}
            any_match = False
            for schema_name, table_name in cursor.fetchall():
                if table_name.lower() in allowed_bare:
                    any_match = True
                    break
                if f"{schema_name}.{table_name}".lower() in allowed_full:
                    any_match = True
                    break
            if not any_match:
                diag["error_code"] = "table_allowlist_filtered_all"
                diag["error_message"] = (
                    "The table allowlist filtered out every table in the allowed schemas."
                )
                _diagnostic_log("table_allowlist_filtered_all")
                _safe_close(conn)
                return diag
        except Exception as exc:
            # Treat allowlist-check failures as metadata permission denial
            # rather than masking them as success.
            code, message = _classify_pyodbc_error(exc)
            if code == "unknown_error":
                code, message = (
                    "metadata_permission_denied",
                    "Connected, but metadata views could not be read.",
                )
            diag["error_code"] = code
            diag["error_message"] = message
            _diagnostic_log(code, layer="metadata_allowlist", error_class=type(exc).__name__)
            _safe_close(conn)
            return diag

    diag["ok"] = True
    _diagnostic_log("ok", table_count=table_count, accessible_schemas=len(accessible))
    _safe_close(conn)
    return diag


def _safe_close(conn) -> None:
    try:
        conn.close()
    except Exception:
        pass


# ----------------------------------------------------------------------------
# Adapter
# ----------------------------------------------------------------------------


class SqlServerRestAdapter(SqlServerAdapter):
    """Real SQL Server adapter using pyodbc + asyncio.to_thread."""

    async def health(self) -> bool:
        try:
            await asyncio.to_thread(self._health_sync)
            return True
        except AdapterUnavailable:
            raise
        except Exception:
            return False

    async def table_count(self) -> int:
        """Return total accessible table count (used by /config/test-sql-server)."""
        try:
            return await asyncio.to_thread(self._table_count_sync)
        except AdapterUnavailable:
            raise
        except Exception:
            return 0

    async def fetch_schema_slice(
        self,
        *,
        tables: list[str],
        include_procs: bool = False,
    ) -> DbContext:
        start = time.monotonic()
        logger.info(
            "sql_server_schema_fetch_started",
            table_hints=len(tables),
            include_procs=include_procs,
        )
        try:
            result = await asyncio.to_thread(
                self._fetch_schema_slice_sync, tables, include_procs
            )
            logger.info(
                "sql_server_schema_fetch_completed",
                tables=len(result.tables),
                fks=len(result.foreign_keys),
                indexes=len(result.indexes),
                procs=len(result.stored_procedures),
                duration_ms=int((time.monotonic() - start) * 1000),
            )
            return result
        except AdapterUnavailable:
            raise
        except Exception as exc:
            code, _msg = _classify_pyodbc_error(exc) if exc.__class__.__name__.endswith("Error") else ("unknown_error", "")
            logger.warning(
                "sql_server_schema_fetch_failed",
                category=type(exc).__name__,
                code=code,
                duration_ms=int((time.monotonic() - start) * 1000),
            )
            raise AdapterUnavailable(
                "sql_server", f"schema fetch failed: {code}", code=code
            ) from exc

    # ------------------------------------------------------------------
    # Sync helpers (run inside asyncio.to_thread)
    # ------------------------------------------------------------------

    def _connect(self):
        """Open a pyodbc connection. Raises AdapterUnavailable on any failure.

        Failure reasons are typed via `code` so context_bundle_service can
        surface them in context_metadata.errors without re-parsing strings.
        """
        try:
            from backend.config.settings import get_settings
        except ImportError:  # pragma: no cover
            from config.settings import get_settings

        s = get_settings()
        if not s.sql_server_connection_string:
            raise AdapterUnavailable(
                "sql_server", "SQL Server is not configured.", code="not_configured"
            )

        try:
            import pyodbc  # noqa: PLC0415
        except ImportError:
            raise AdapterUnavailable(
                "sql_server",
                "pyodbc is not installed in the backend environment.",
                code="pyodbc_missing",
            )

        try:
            driver_present, _ = _detect_sql_server_driver()
        except Exception:
            driver_present = False
        if not driver_present:
            raise AdapterUnavailable(
                "sql_server",
                "No SQL Server ODBC driver was detected.",
                code="odbc_driver_missing",
            )

        try:
            conn = pyodbc.connect(s.sql_server_connection_string, timeout=_QUERY_TIMEOUT)
            conn.timeout = _QUERY_TIMEOUT
            return conn
        except pyodbc.Error as exc:
            code, message = _classify_pyodbc_error(exc)
            logger.warning(
                "sql_server_connect_failed",
                code=code,
                error_class=type(exc).__name__,
            )
            raise AdapterUnavailable("sql_server", message, code=code) from exc

    def _health_sync(self) -> None:
        logger.info("sql_server_health_check_started")
        conn = self._connect()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
        finally:
            conn.close()
        logger.info("sql_server_health_check_completed")

    def _table_count_sync(self) -> int:
        conn = self._connect()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) FROM sys.tables t "
                "JOIN sys.schemas s ON t.schema_id = s.schema_id"
            )
            row = cursor.fetchone()
            return int(row[0]) if row else 0
        finally:
            conn.close()

    def _fetch_schema_slice_sync(
        self, tables: list[str], include_procs: bool
    ) -> DbContext:
        try:
            from backend.config.settings import get_settings
        except ImportError:  # pragma: no cover
            from config.settings import get_settings

        s = get_settings()
        allowed_schemas = _parse_csv(s.sql_server_schema_allowlist) or ["dbo"]
        table_allowlist = _parse_csv(s.sql_server_table_allowlist)

        conn = self._connect()
        try:
            # --- tables in allowed schemas ---
            all_tables = _query_tables(conn, allowed_schemas)

            # Case-insensitive allowlist filter — match either bare or
            # schema-qualified entries.
            if table_allowlist:
                al_bare = {_bare_name(n).lower() for n in table_allowlist}
                al_full = {n.lower() for n in table_allowlist if "." in n}
                filtered = [
                    t for t in all_tables
                    if t["table"].lower() in al_bare
                    or f"{t['schema']}.{t['table']}".lower() in al_full
                ]
                if not filtered:
                    raise AdapterUnavailable(
                        "sql_server",
                        "The table allowlist filtered out every table in the allowed schemas.",
                        code="table_allowlist_filtered_all",
                    )
                all_tables = filtered

            # Filter to inferred table hints (caller provides candidate names)
            if tables:
                hints = {_bare_name(n).lower() for n in tables}
                relevant = [t for t in all_tables if t["table"].lower() in hints]
                if not relevant:
                    # Fall back to first N from allowlisted schemas
                    relevant = all_tables[:_MAX_TABLES]
            else:
                relevant = all_tables[:_MAX_TABLES]

            relevant = relevant[:_MAX_TABLES]
            table_names = [t["table"] for t in relevant]

            columns_by_key = _query_columns(conn, allowed_schemas, table_names)
            pk_by_table = _query_primary_keys(conn, table_names)

            table_schemas: list[TableSchema] = []
            for t in relevant:
                key = f"{t['schema']}.{t['table']}"
                cols = columns_by_key.get(key, [])[:_MAX_COLS_PER_TABLE]
                pk_cols = pk_by_table.get(t["table"], set())
                table_schemas.append(
                    TableSchema(
                        name=key,
                        columns=[
                            {
                                "name": c["name"],
                                "type": c["type"],
                                "nullable": c["nullable"],
                                "max_length": c["max_length"] if c["max_length"] >= 0 else None,
                                "is_identity": c["is_identity"],
                                "is_primary_key": c["name"] in pk_cols,
                            }
                            for c in cols
                        ],
                    )
                )

            fks = _query_foreign_keys(conn, allowed_schemas, table_names)[:_MAX_FKS]
            indexes = _query_indexes(conn, allowed_schemas, table_names)[:_MAX_INDEXES]

            procs: list[dict[str, Any]] = []
            if include_procs:
                procs = _query_procs(conn, allowed_schemas)[:_MAX_PROCS]

            return DbContext(
                tables=table_schemas,
                foreign_keys=fks,
                indexes=indexes,
                stored_procedures=procs,
            )
        finally:
            conn.close()


# ------------------------------------------------------------------
# Module-level metadata query helpers (pure sync, no state)
# ------------------------------------------------------------------


def _placeholders(items: list) -> str:
    return ",".join("?" * len(items))


def _query_tables(conn, schemas: list[str]) -> list[dict[str, str]]:
    ph = _placeholders(schemas)
    sql = (
        "SELECT t.name, s.name "
        "FROM sys.tables t "
        "JOIN sys.schemas s ON t.schema_id = s.schema_id "
        f"WHERE s.name IN ({ph}) "
        "ORDER BY s.name, t.name"
    )
    cursor = conn.cursor()
    cursor.execute(sql, schemas)
    return [{"table": row[0], "schema": row[1]} for row in cursor.fetchall()]


def _query_columns(
    conn, schemas: list[str], table_names: list[str]
) -> dict[str, list[dict[str, Any]]]:
    if not table_names:
        return {}
    ph_s = _placeholders(schemas)
    ph_t = _placeholders(table_names)
    sql = (
        "SELECT s.name, t.name, c.name, ty.name, c.is_nullable, c.max_length, c.is_identity "
        "FROM sys.columns c "
        "JOIN sys.tables t ON c.object_id = t.object_id "
        "JOIN sys.schemas s ON t.schema_id = s.schema_id "
        "JOIN sys.types ty ON c.user_type_id = ty.user_type_id "
        f"WHERE s.name IN ({ph_s}) AND t.name IN ({ph_t}) "
        "ORDER BY s.name, t.name, c.column_id"
    )
    cursor = conn.cursor()
    cursor.execute(sql, schemas + table_names)
    result: dict[str, list[dict[str, Any]]] = {}
    for schema, table, col, typ, nullable, max_len, is_id in cursor.fetchall():
        key = f"{schema}.{table}"
        result.setdefault(key, []).append(
            {
                "name": col,
                "type": typ,
                "nullable": bool(nullable),
                "max_length": int(max_len),
                "is_identity": bool(is_id),
            }
        )
    return result


def _query_primary_keys(conn, table_names: list[str]) -> dict[str, set[str]]:
    if not table_names:
        return {}
    ph_t = _placeholders(table_names)
    sql = (
        "SELECT t.name, c.name "
        "FROM sys.indexes i "
        "JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id "
        "JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id "
        "JOIN sys.tables t ON i.object_id = t.object_id "
        f"WHERE i.is_primary_key = 1 AND t.name IN ({ph_t})"
    )
    cursor = conn.cursor()
    cursor.execute(sql, table_names)
    result: dict[str, set[str]] = {}
    for table, col in cursor.fetchall():
        result.setdefault(table, set()).add(col)
    return result


def _query_foreign_keys(
    conn, schemas: list[str], table_names: list[str]
) -> list[dict[str, Any]]:
    if not table_names:
        return []
    ph_s = _placeholders(schemas)
    ph_t = _placeholders(table_names)
    sql = (
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
    )
    cursor = conn.cursor()
    cursor.execute(sql, schemas + table_names)
    return [
        {
            "name": row[0],
            "from_table": f"{row[1]}.{row[2]}",
            "from_column": row[3],
            "to_table": f"{row[4]}.{row[5]}",
            "to_column": row[6],
        }
        for row in cursor.fetchall()
    ]


def _query_indexes(
    conn, schemas: list[str], table_names: list[str]
) -> list[dict[str, Any]]:
    if not table_names:
        return []
    ph_s = _placeholders(schemas)
    ph_t = _placeholders(table_names)
    sql_ix = (
        "SELECT i.object_id, i.index_id, i.name, s.name, t.name, i.is_unique, i.is_primary_key "
        "FROM sys.indexes i "
        "JOIN sys.tables t ON i.object_id = t.object_id "
        "JOIN sys.schemas s ON t.schema_id = s.schema_id "
        f"WHERE s.name IN ({ph_s}) AND t.name IN ({ph_t}) AND i.name IS NOT NULL "
        "ORDER BY s.name, t.name, i.name"
    )
    cursor = conn.cursor()
    cursor.execute(sql_ix, schemas + table_names)
    index_rows = cursor.fetchall()

    if not index_rows:
        return []

    sql_cols = (
        "SELECT ic.object_id, ic.index_id, c.name "
        "FROM sys.index_columns ic "
        "JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id "
        "WHERE ic.key_ordinal > 0 "
        "ORDER BY ic.object_id, ic.index_id, ic.key_ordinal"
    )
    cursor.execute(sql_cols)
    col_map: dict[tuple[int, int], list[str]] = {}
    for obj_id, ix_id, col_name in cursor.fetchall():
        col_map.setdefault((obj_id, ix_id), []).append(col_name)

    return [
        {
            "name": r[2],
            "table": f"{r[3]}.{r[4]}",
            "columns": col_map.get((r[0], r[1]), []),
            "unique": bool(r[5]),
            "primary_key": bool(r[6]),
        }
        for r in index_rows
    ]


def _query_procs(conn, schemas: list[str]) -> list[dict[str, Any]]:
    ph_s = _placeholders(schemas)
    sql = (
        "SELECT o.name, s.name, m.definition "
        "FROM sys.sql_modules m "
        "JOIN sys.objects o ON m.object_id = o.object_id "
        "JOIN sys.schemas s ON o.schema_id = s.schema_id "
        f"WHERE o.type = 'P' AND s.name IN ({ph_s}) "
        "ORDER BY s.name, o.name"
    )
    cursor = conn.cursor()
    cursor.execute(sql, schemas)
    return [
        {
            "name": f"{row[1]}.{row[0]}",
            "definition": (row[2] or "")[:_MAX_PROC_CHARS],
        }
        for row in cursor.fetchall()
    ]


# ------------------------------------------------------------------
# Stub kept for import compatibility and tests
# ------------------------------------------------------------------


class SqlServerStubAdapter(SqlServerAdapter):
    """Unavailable provider — placeholder for when SQL Server is not configured."""

    async def health(self) -> bool:
        return False

    async def fetch_schema_slice(
        self,
        *,
        tables: list[str],
        include_procs: bool = False,
    ) -> DbContext:
        raise AdapterUnavailable(
            "sql_server", "SQL Server is not configured.", code="not_configured"
        )


SqlServerAdapterStub = SqlServerStubAdapter
