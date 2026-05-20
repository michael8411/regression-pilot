"""Tests for the SQL Server schema-context adapter (Phase 16).

All tests mock the pyodbc connection layer — no real SQL Server is required.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from services.context_bundle_service import infer_sql_tables
from services.provider_adapters.base import AdapterUnavailable


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(coro):
    return asyncio.run(coro)


def _make_cursor(rows: list[tuple]) -> MagicMock:
    cursor = MagicMock()
    cursor.fetchall.return_value = rows
    cursor.fetchone.return_value = rows[0] if rows else None
    return cursor


def _make_conn(cursor: MagicMock) -> MagicMock:
    conn = MagicMock()
    conn.cursor.return_value = cursor
    return conn


# ---------------------------------------------------------------------------
# Settings.sql_server_configured
# ---------------------------------------------------------------------------


class TestSqlServerConfigured:
    def test_false_when_empty(self, fake_keyring):
        from config.settings import get_settings
        s = get_settings()
        assert s.sql_server_configured is False

    def test_true_when_connection_string_set(self, fake_keyring):
        fake_keyring.set_password("testdeck", "sql_server_connection_string", "Driver={SQL Server};Server=localhost;")
        from config.settings import get_settings
        get_settings.cache_clear()
        s = get_settings()
        assert s.sql_server_configured is True

    def test_include_procs_false_by_default(self, fake_keyring):
        from config.settings import get_settings
        s = get_settings()
        assert s.sql_server_include_procs is False

    def test_include_procs_true_from_keyring(self, fake_keyring):
        fake_keyring.set_password("testdeck", "sql_server_include_procs", "true")
        from config.settings import get_settings
        get_settings.cache_clear()
        s = get_settings()
        assert s.sql_server_include_procs is True


# ---------------------------------------------------------------------------
# SqlServerRestAdapter
# ---------------------------------------------------------------------------


@pytest.fixture
def adapter(fake_keyring):
    """Return SqlServerRestAdapter with keyring stubbed."""
    from services.provider_adapters.sql_server import SqlServerRestAdapter
    return SqlServerRestAdapter()


@pytest.fixture
def configured_adapter(fake_keyring):
    """Return SqlServerRestAdapter with a fake connection string configured."""
    fake_keyring.set_password("testdeck", "sql_server_connection_string", "Driver={SQL Server};Server=localhost;")
    from config.settings import get_settings
    get_settings.cache_clear()
    from services.provider_adapters.sql_server import SqlServerRestAdapter
    return SqlServerRestAdapter()


class TestHealthCheck:
    def test_health_raises_unavailable_when_not_configured(self, adapter):
        with pytest.raises(AdapterUnavailable):
            _run(adapter.health())

    def test_health_raises_unavailable_when_pyodbc_missing(self, configured_adapter, monkeypatch):
        import builtins
        real_import = builtins.__import__

        def _no_pyodbc(name, *args, **kwargs):
            if name == "pyodbc":
                raise ImportError("no pyodbc")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", _no_pyodbc)
        with pytest.raises(AdapterUnavailable) as exc_info:
            _run(configured_adapter.health())
        assert "pyodbc" in exc_info.value.reason.lower()

    def test_health_returns_true_on_success(self, configured_adapter, monkeypatch):
        cursor = _make_cursor([(1,)])
        conn = _make_conn(cursor)

        monkeypatch.setattr(
            "services.provider_adapters.sql_server.SqlServerRestAdapter._connect",
            lambda self: conn,
        )
        result = _run(configured_adapter.health())
        assert result is True

    def test_health_raises_unavailable_on_connection_error(self, configured_adapter, monkeypatch):
        def _fail_connect(self):
            raise AdapterUnavailable("sql_server", "connection failed")

        monkeypatch.setattr(
            "services.provider_adapters.sql_server.SqlServerRestAdapter._connect",
            _fail_connect,
        )
        with pytest.raises(AdapterUnavailable):
            _run(configured_adapter.health())


class TestFetchSchemaSlice:
    """Tests for fetch_schema_slice — adapter normalization, caps, allowlists."""

    def _patch_conn(self, monkeypatch, configured_adapter, conn):
        monkeypatch.setattr(
            "services.provider_adapters.sql_server.SqlServerRestAdapter._connect",
            lambda self: conn,
        )

    def _build_cursor_for_full_fetch(
        self,
        *,
        tables: list[tuple] | None = None,
        columns: list[tuple] | None = None,
        pk_cols: list[tuple] | None = None,
        fks: list[tuple] | None = None,
        index_rows: list[tuple] | None = None,
        index_cols: list[tuple] | None = None,
        procs: list[tuple] | None = None,
    ) -> MagicMock:
        """Return a cursor that sequences through multiple fetchall() calls."""
        tables = tables or [("TimeCard", "dbo"), ("Employee", "dbo")]
        columns = columns or [
            ("dbo", "TimeCard", "Id", "int", 0, 4, 1),
            ("dbo", "TimeCard", "EmployeeId", "int", 0, 4, 0),
            ("dbo", "Employee", "Id", "int", 0, 4, 1),
            ("dbo", "Employee", "Name", "nvarchar", 1, 100, 0),
        ]
        pk_cols = pk_cols or [("TimeCard", "Id"), ("Employee", "Id")]
        fks = fks or [
            ("FK_TimeCard_Employee", "dbo", "TimeCard", "EmployeeId", "dbo", "Employee", "Id"),
        ]
        index_rows = index_rows or [
            (100, 1, "PK_TimeCard", "dbo", "TimeCard", False, True),
        ]
        index_cols = index_cols or [(100, 1, "Id")]
        procs = procs or []

        call_seq = [tables, columns, pk_cols, fks, index_rows, index_cols]
        if procs is not None:
            call_seq.append(procs)

        cursor = MagicMock()
        cursor.fetchall.side_effect = list(call_seq)
        return cursor

    def test_normalizes_table_schemas(self, configured_adapter, monkeypatch):
        cursor = self._build_cursor_for_full_fetch()
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(
            configured_adapter.fetch_schema_slice(tables=["TimeCard", "Employee"])
        )
        assert len(result.tables) == 2
        assert result.tables[0].name == "dbo.TimeCard"
        cols = result.tables[0].columns
        assert cols[0]["name"] == "Id"
        assert cols[0]["is_identity"] is True
        assert cols[0]["is_primary_key"] is True
        assert cols[1]["name"] == "EmployeeId"
        assert cols[1]["is_primary_key"] is False

    def test_includes_foreign_keys(self, configured_adapter, monkeypatch):
        cursor = self._build_cursor_for_full_fetch()
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(configured_adapter.fetch_schema_slice(tables=["TimeCard"]))
        assert len(result.foreign_keys) == 1
        fk = result.foreign_keys[0]
        assert fk["name"] == "FK_TimeCard_Employee"
        assert fk["from_table"] == "dbo.TimeCard"
        assert fk["to_table"] == "dbo.Employee"

    def test_includes_indexes(self, configured_adapter, monkeypatch):
        cursor = self._build_cursor_for_full_fetch()
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(configured_adapter.fetch_schema_slice(tables=["TimeCard"]))
        assert len(result.indexes) == 1
        ix = result.indexes[0]
        assert ix["name"] == "PK_TimeCard"
        assert ix["primary_key"] is True
        assert "Id" in ix["columns"]

    def test_no_procs_when_include_procs_false(self, configured_adapter, monkeypatch):
        cursor = self._build_cursor_for_full_fetch(procs=[])
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(
            configured_adapter.fetch_schema_slice(tables=[], include_procs=False)
        )
        assert result.stored_procedures == []

    def test_procs_included_when_include_procs_true(self, configured_adapter, monkeypatch, fake_keyring):
        proc_rows = [("CalculatePayroll", "dbo", "CREATE PROCEDURE dbo.CalculatePayroll AS BEGIN SELECT 1 END")]
        cursor = self._build_cursor_for_full_fetch(procs=proc_rows)
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(
            configured_adapter.fetch_schema_slice(tables=[], include_procs=True)
        )
        assert len(result.stored_procedures) == 1
        assert result.stored_procedures[0]["name"] == "dbo.CalculatePayroll"

    def test_caps_tables_at_max(self, configured_adapter, monkeypatch, fake_keyring):
        many_tables = [(f"Table{i}", "dbo") for i in range(20)]
        many_columns: list[tuple] = []
        cursor = self._build_cursor_for_full_fetch(
            tables=many_tables, columns=many_columns, pk_cols=[], fks=[], index_rows=[], index_cols=[]
        )
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(configured_adapter.fetch_schema_slice(tables=[]))
        assert len(result.tables) <= 8

    def test_caps_columns_per_table(self, configured_adapter, monkeypatch, fake_keyring):
        tables = [("BigTable", "dbo")]
        many_cols = [("dbo", "BigTable", f"Col{i}", "int", 1, 4, 0) for i in range(120)]
        cursor = self._build_cursor_for_full_fetch(
            tables=tables, columns=many_cols, pk_cols=[], fks=[], index_rows=[], index_cols=[]
        )
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(configured_adapter.fetch_schema_slice(tables=["BigTable"]))
        assert len(result.tables[0].columns) <= 80

    def test_caps_foreign_keys(self, configured_adapter, monkeypatch, fake_keyring):
        tables = [("T1", "dbo")]
        many_fks = [
            (f"FK_{i}", "dbo", "T1", f"Col{i}", "dbo", "Other", "Id")
            for i in range(60)
        ]
        cursor = self._build_cursor_for_full_fetch(
            tables=tables, columns=[], pk_cols=[], fks=many_fks, index_rows=[], index_cols=[]
        )
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(configured_adapter.fetch_schema_slice(tables=["T1"]))
        assert len(result.foreign_keys) <= 40

    def test_caps_procs_at_max(self, configured_adapter, monkeypatch, fake_keyring):
        many_procs = [(f"Proc{i}", "dbo", "CREATE PROC") for i in range(10)]
        cursor = self._build_cursor_for_full_fetch(procs=many_procs)
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(configured_adapter.fetch_schema_slice(tables=[], include_procs=True))
        assert len(result.stored_procedures) <= 5

    def test_proc_definition_truncated(self, configured_adapter, monkeypatch, fake_keyring):
        long_def = "X" * 5000
        procs = [("BigProc", "dbo", long_def)]
        cursor = self._build_cursor_for_full_fetch(procs=procs)
        conn = _make_conn(cursor)
        self._patch_conn(monkeypatch, configured_adapter, conn)

        result = _run(configured_adapter.fetch_schema_slice(tables=[], include_procs=True))
        assert len(result.stored_procedures[0]["definition"]) <= 2000

    def test_schema_allowlist_applied(self, fake_keyring, monkeypatch):
        """Only tables from allowed schemas are fetched."""
        fake_keyring.set_password("testdeck", "sql_server_connection_string", "Driver={SQL Server};Server=localhost;")
        fake_keyring.set_password("testdeck", "sql_server_schema_allowlist", "audit")
        from config.settings import get_settings
        get_settings.cache_clear()
        from services.provider_adapters.sql_server import SqlServerRestAdapter

        adapter = SqlServerRestAdapter()
        captured_schemas: list[list[str]] = []

        original_query_tables = __import__(
            "services.provider_adapters.sql_server", fromlist=["_query_tables"]
        )._query_tables

        def _spy_tables(conn, schemas):
            captured_schemas.append(schemas)
            return []

        monkeypatch.setattr(
            "services.provider_adapters.sql_server._query_tables", _spy_tables
        )
        conn = MagicMock()
        monkeypatch.setattr(
            "services.provider_adapters.sql_server.SqlServerRestAdapter._connect",
            lambda self: conn,
        )

        _run(adapter.fetch_schema_slice(tables=[]))
        assert captured_schemas[0] == ["audit"]

    def test_graceful_failure_raises_adapter_unavailable(self, configured_adapter, monkeypatch):
        def _fail_connect(self):
            raise AdapterUnavailable("sql_server", "timeout")

        monkeypatch.setattr(
            "services.provider_adapters.sql_server.SqlServerRestAdapter._connect",
            _fail_connect,
        )
        with pytest.raises(AdapterUnavailable):
            _run(configured_adapter.fetch_schema_slice(tables=[]))


# ---------------------------------------------------------------------------
# Orchestrator wiring
# ---------------------------------------------------------------------------


class TestOrchestratorWiring:
    def _fresh_orchestrator(self):
        """Reload the orchestrator so it picks up the current fake-keyring settings."""
        import importlib
        import sys
        for key in ("services.context_orchestrator", "backend.services.context_orchestrator"):
            sys.modules.pop(key, None)
        return importlib.import_module("services.context_orchestrator")

    def test_sql_adapter_none_when_not_configured(self, fake_keyring):
        orc = self._fresh_orchestrator()
        ticket = {"key": "FM-1", "summary": "test"}
        adapters = orc.build_default_adapters(ticket)
        assert adapters.sql_server is None

    def test_sql_adapter_wired_when_configured(self, fake_keyring):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={SQL Server};Server=localhost;"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        orc = self._fresh_orchestrator()
        from services.provider_adapters.sql_server import SqlServerRestAdapter

        ticket = {"key": "FM-1", "summary": "test"}
        adapters = orc.build_default_adapters(ticket)
        assert isinstance(adapters.sql_server, SqlServerRestAdapter)


# ---------------------------------------------------------------------------
# Graceful degradation in context bundle
# ---------------------------------------------------------------------------


class TestGracefulDegradation:
    def test_sql_failure_recorded_in_trace_not_abort(self, fake_keyring):
        """SQL Server failure must appear in tool_trace.errors but not raise."""
        import asyncio
        from services.context_bundle_service import AdapterSet, build_context_bundle
        from services.provider_adapters.base import AdapterUnavailable

        class _FailSqlAdapter:
            name = "sql_server"

            async def fetch_schema_slice(self, *, tables, include_procs=False):
                raise AdapterUnavailable("sql_server", "timeout")

            async def health(self):
                return False

        ticket = {
            "key": "FM-1",
            "summary": "TimeCard database issue",
            "labels": ["API"],
            "components": [],
        }
        adapters = AdapterSet(sql_server=_FailSqlAdapter())  # type: ignore[arg-type]
        bundle = asyncio.run(
            build_context_bundle(ticket, adapters=adapters, platform_mapping={})
        )
        sql_errors = [e for e in bundle.tool_trace.errors if e.provider == "sql_server"]
        assert sql_errors, "sql_server error should be recorded"
        assert bundle.db_context.tables == []  # no data but no exception


# ---------------------------------------------------------------------------
# Table inference helper
# ---------------------------------------------------------------------------


class TestInferSqlTables:
    def test_extracts_pascal_case(self):
        ticket = {"summary": "TimeCard calculation is wrong", "description": "", "labels": [], "components": []}
        result = infer_sql_tables(ticket)
        assert "TimeCard" in result

    def test_extracts_multi_word_camel(self):
        ticket = {"summary": "EmployeeId not set in PayrollEntry", "description": "", "labels": [], "components": []}
        result = infer_sql_tables(ticket)
        # EmployeeId and PayrollEntry are CamelCase
        assert any("Payroll" in t or "PayrollEntry" in t for t in result)

    def test_includes_labels(self):
        ticket = {"summary": "bug", "description": "", "labels": ["DATABASE", "Payroll"], "components": []}
        result = infer_sql_tables(ticket)
        assert "DATABASE" in result or "Payroll" in result

    def test_includes_components(self):
        ticket = {"summary": "bug", "description": "", "labels": [], "components": [{"name": "Timekeeping"}]}
        result = infer_sql_tables(ticket)
        assert "Timekeeping" in result

    def test_filters_stopwords(self):
        ticket = {"summary": "Fix the bug in the backend API", "description": "", "labels": ["backend", "api"], "components": []}
        result = infer_sql_tables(ticket)
        assert "backend" not in result
        assert "api" not in result

    def test_caps_at_max_tables(self):
        long_summary = " ".join(f"Table{i}Entity" for i in range(20))
        ticket = {"summary": long_summary, "description": "", "labels": [], "components": []}
        result = infer_sql_tables(ticket)
        assert len(result) <= 8

    def test_deterministic_same_input(self):
        ticket = {"summary": "TimeCard EmployeeId PayrollEntry", "description": "fix", "labels": ["API"], "components": []}
        assert infer_sql_tables(ticket) == infer_sql_tables(ticket)

    def test_deduplicates_case_insensitively(self):
        ticket = {"summary": "TimeCard timecard TimeCard", "description": "", "labels": [], "components": []}
        result = infer_sql_tables(ticket)
        lower_count = sum(1 for t in result if t.lower() == "timecard")
        assert lower_count == 1

    def test_empty_ticket_returns_empty(self):
        ticket = {"summary": "", "description": "", "labels": [], "components": []}
        result = infer_sql_tables(ticket)
        assert result == []


# ---------------------------------------------------------------------------
# SQL Server diagnostics
# ---------------------------------------------------------------------------


class _FakePyodbcError(Exception):
    """Stands in for pyodbc.Error in tests; classifier matches on string only."""


class TestDiagnostics:
    def test_not_configured(self, fake_keyring):
        from services.provider_adapters.sql_server import diagnose_sql_server
        result = _run(diagnose_sql_server())
        assert result["configured"] is False
        assert result["error_code"] == "not_configured"
        assert result["ok"] is False

    def test_pyodbc_missing(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={x};Server=x;"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        import builtins
        real_import = builtins.__import__

        def _no_pyodbc(name, *args, **kwargs):
            if name == "pyodbc":
                raise ImportError("no pyodbc")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", _no_pyodbc)
        from services.provider_adapters.sql_server import diagnose_sql_server
        result = _run(diagnose_sql_server())
        assert result["error_code"] == "pyodbc_missing"

    def test_odbc_driver_missing(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={x};Server=x;"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        # Provide a fake pyodbc so the import-check stage passes; then mock
        # the driver detection to report "none installed".
        class _FakePyodbcModule:
            Error = _FakePyodbcError

            @staticmethod
            def drivers():
                return ["PostgreSQL ODBC"]

        import sys
        monkeypatch.setitem(sys.modules, "pyodbc", _FakePyodbcModule)
        monkeypatch.setattr(
            "services.provider_adapters.sql_server._detect_sql_server_driver",
            lambda: (False, ["PostgreSQL ODBC"]),
        )
        from services.provider_adapters.sql_server import diagnose_sql_server
        result = _run(diagnose_sql_server())
        assert result["error_code"] == "odbc_driver_missing"
        assert result["driver_detected"] is False

    def test_connection_failed(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={x};Server=x;"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        monkeypatch.setattr(
            "services.provider_adapters.sql_server._detect_sql_server_driver",
            lambda: (True, ["ODBC Driver 18 for SQL Server"]),
        )

        class _FakePyodbcModule:
            Error = _FakePyodbcError

            @staticmethod
            def connect(*_a, **_kw):
                raise _FakePyodbcError("TCP Provider: timeout expired")

        import sys
        monkeypatch.setitem(sys.modules, "pyodbc", _FakePyodbcModule)

        from services.provider_adapters.sql_server import diagnose_sql_server
        result = _run(diagnose_sql_server())
        assert result["error_code"] == "connection_failed"
        assert "raw" not in (result["error_message"] or "").lower()

    def test_login_failed(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={x};Server=x;"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        monkeypatch.setattr(
            "services.provider_adapters.sql_server._detect_sql_server_driver",
            lambda: (True, ["ODBC Driver 18 for SQL Server"]),
        )

        class _FakePyodbcModule:
            Error = _FakePyodbcError

            @staticmethod
            def connect(*_a, **_kw):
                raise _FakePyodbcError("Login failed for user 'svc'")

        import sys
        monkeypatch.setitem(sys.modules, "pyodbc", _FakePyodbcModule)

        from services.provider_adapters.sql_server import diagnose_sql_server
        result = _run(diagnose_sql_server())
        assert result["error_code"] == "login_failed"

    def test_metadata_permission_denied(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={x};Server=x;"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        monkeypatch.setattr(
            "services.provider_adapters.sql_server._detect_sql_server_driver",
            lambda: (True, ["ODBC Driver 18 for SQL Server"]),
        )

        # Build a connection whose cursor raises on the metadata schema query.
        cursor = MagicMock()
        cursor.execute.side_effect = _FakePyodbcError(
            "SELECT permission was denied on the object 'schemas'"
        )
        cursor.fetchall.return_value = []
        cursor.fetchone.return_value = None
        conn = MagicMock()
        conn.cursor.return_value = cursor

        class _FakePyodbcModule:
            Error = _FakePyodbcError

            @staticmethod
            def connect(*_a, **_kw):
                return conn

        import sys
        monkeypatch.setitem(sys.modules, "pyodbc", _FakePyodbcModule)

        from services.provider_adapters.sql_server import diagnose_sql_server
        result = _run(diagnose_sql_server())
        assert result["error_code"] == "metadata_permission_denied"
        assert result["connection_ok"] is True
        assert result["metadata_ok"] is False

    def test_success_returns_table_count_and_schemas(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={x};Server=x;"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        monkeypatch.setattr(
            "services.provider_adapters.sql_server._detect_sql_server_driver",
            lambda: (True, ["ODBC Driver 18 for SQL Server"]),
        )

        cursor = MagicMock()
        # Returns schemas list then table count.
        cursor.fetchall.side_effect = [
            [("dbo",), ("audit",)],
        ]
        cursor.fetchone.return_value = (5,)
        conn = MagicMock()
        conn.cursor.return_value = cursor

        class _FakePyodbcModule:
            Error = _FakePyodbcError

            @staticmethod
            def connect(*_a, **_kw):
                return conn

        import sys
        monkeypatch.setitem(sys.modules, "pyodbc", _FakePyodbcModule)

        from services.provider_adapters.sql_server import diagnose_sql_server
        result = _run(diagnose_sql_server())
        assert result["ok"] is True
        assert result["table_count"] == 5
        assert "dbo" in result["accessible_schemas"]

    def test_schema_allowlist_empty(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={x};Server=x;"
        )
        # Allowlist references a schema that won't be visible.
        fake_keyring.set_password(
            "testdeck", "sql_server_schema_allowlist", "no_such_schema"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        monkeypatch.setattr(
            "services.provider_adapters.sql_server._detect_sql_server_driver",
            lambda: (True, ["ODBC Driver 18 for SQL Server"]),
        )

        cursor = MagicMock()
        cursor.fetchall.side_effect = [
            [("dbo",), ("audit",)],
        ]
        conn = MagicMock()
        conn.cursor.return_value = cursor

        class _FakePyodbcModule:
            Error = _FakePyodbcError

            @staticmethod
            def connect(*_a, **_kw):
                return conn

        import sys
        monkeypatch.setitem(sys.modules, "pyodbc", _FakePyodbcModule)

        from services.provider_adapters.sql_server import diagnose_sql_server
        result = _run(diagnose_sql_server())
        assert result["error_code"] == "schema_allowlist_empty"

    def test_diagnostics_omit_connection_string_and_raw_text(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck",
            "sql_server_connection_string",
            "Driver={x};Server=secret-host;UID=admin;PWD=hunter2;",
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        monkeypatch.setattr(
            "services.provider_adapters.sql_server._detect_sql_server_driver",
            lambda: (True, ["ODBC Driver 18 for SQL Server"]),
        )

        class _FakePyodbcModule:
            Error = _FakePyodbcError

            @staticmethod
            def connect(*_a, **_kw):
                raise _FakePyodbcError(
                    "Login failed for user 'admin' password=hunter2 host=secret-host"
                )

        import sys
        monkeypatch.setitem(sys.modules, "pyodbc", _FakePyodbcModule)

        from services.provider_adapters.sql_server import diagnose_sql_server
        result = _run(diagnose_sql_server())
        serialized = str(result)
        assert "hunter2" not in serialized
        assert "secret-host" not in serialized
        assert "PWD" not in serialized


# ---------------------------------------------------------------------------
# AdapterUnavailable codes
# ---------------------------------------------------------------------------


class TestAdapterUnavailableCodes:
    def test_not_configured_code(self, fake_keyring):
        from services.provider_adapters.sql_server import SqlServerRestAdapter
        adapter = SqlServerRestAdapter()
        with pytest.raises(AdapterUnavailable) as exc_info:
            adapter._connect()
        assert exc_info.value.code == "not_configured"

    def test_login_failed_code(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={x};Server=x;"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        monkeypatch.setattr(
            "services.provider_adapters.sql_server._detect_sql_server_driver",
            lambda: (True, ["ODBC Driver 18 for SQL Server"]),
        )

        class _FakePyodbcModule:
            Error = _FakePyodbcError

            @staticmethod
            def connect(*_a, **_kw):
                raise _FakePyodbcError("Login failed for user 'x'")

        import sys
        monkeypatch.setitem(sys.modules, "pyodbc", _FakePyodbcModule)

        from services.provider_adapters.sql_server import SqlServerRestAdapter
        adapter = SqlServerRestAdapter()
        with pytest.raises(AdapterUnavailable) as exc_info:
            adapter._connect()
        assert exc_info.value.code == "login_failed"

    def test_odbc_driver_missing_code(self, fake_keyring, monkeypatch):
        fake_keyring.set_password(
            "testdeck", "sql_server_connection_string", "Driver={x};Server=x;"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        class _FakePyodbcModule:
            Error = _FakePyodbcError

            @staticmethod
            def drivers():
                return []

        import sys
        monkeypatch.setitem(sys.modules, "pyodbc", _FakePyodbcModule)
        monkeypatch.setattr(
            "services.provider_adapters.sql_server._detect_sql_server_driver",
            lambda: (False, []),
        )
        from services.provider_adapters.sql_server import SqlServerRestAdapter
        adapter = SqlServerRestAdapter()
        with pytest.raises(AdapterUnavailable) as exc_info:
            adapter._connect()
        assert exc_info.value.code == "odbc_driver_missing"


class TestGracefulDegradationSurfacesCode:
    def test_sql_error_code_visible_in_trace(self, fake_keyring):
        import asyncio
        from services.context_bundle_service import AdapterSet, build_context_bundle
        from services.provider_adapters.base import AdapterUnavailable

        class _FailSqlAdapter:
            name = "sql_server"

            async def fetch_schema_slice(self, *, tables, include_procs=False):
                raise AdapterUnavailable(
                    "sql_server",
                    "Connected, but metadata views could not be read.",
                    code="metadata_permission_denied",
                )

            async def health(self):
                return False

        ticket = {
            "key": "FM-1",
            "summary": "TimeCard database",
            "labels": ["API"],
            "components": [],
        }
        adapters = AdapterSet(sql_server=_FailSqlAdapter())  # type: ignore[arg-type]
        bundle = asyncio.run(
            build_context_bundle(ticket, adapters=adapters, platform_mapping={})
        )
        codes = [e.code for e in bundle.tool_trace.errors if e.provider == "sql_server"]
        assert "metadata_permission_denied" in codes
