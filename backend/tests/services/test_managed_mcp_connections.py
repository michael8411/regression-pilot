import asyncio

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "managed_mcp_test.db"


def _force_settings(values: dict) -> None:
    from backend.config.settings import get_settings

    get_settings.cache_clear()
    s = get_settings()
    for k, v in values.items():
        object.__setattr__(s, k, v)


@pytest.fixture
def managed_env(fake_keyring, db_path, monkeypatch):
    import backend.db.connection as conn_mod
    import db.connection as compat_conn_mod

    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)
    monkeypatch.setattr(compat_conn_mod, "DB_PATH", db_path)
    from backend.db.init import init_db

    asyncio.run(init_db())

    _force_settings(
        {
            "jira_base_url": "https://acme.atlassian.net/",
            "jira_email": "u@example.com",
            "jira_api_token": "atok",
            "github_access_token": "gtok",
            "ado_org": "myorg",
            "ado_access_token": "ado-tok",
            "sql_server_connection_string": (
                "Driver={ODBC Driver 17 for SQL Server};Server=x;"
            ),
        }
    )
    yield
    # Reset so subsequent tests get a fresh Settings.
    from backend.config.settings import get_settings

    get_settings.cache_clear()


def _run(coro):
    return asyncio.run(coro)


def _idle(_):
    return "idle"


def _no_err(_):
    return None


def test_ensure_provisions_all_four_managed_ids(managed_env):
    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
        MANAGED_ATLASSIAN_ID,
        MANAGED_GITHUB_ID,
        MANAGED_ADO_ID,
        MANAGED_SQL_SERVER_ID,
    )

    ids = _run(ensure_managed_connections())
    assert set(ids) == {
        MANAGED_ATLASSIAN_ID,
        MANAGED_GITHUB_ID,
        MANAGED_ADO_ID,
        MANAGED_SQL_SERVER_ID,
    }


def test_ensure_is_idempotent(managed_env):
    from backend.services.mcp.managed_connections import ensure_managed_connections

    _run(ensure_managed_connections())
    _run(ensure_managed_connections())

    from backend.services import mcp_connection_service as svc

    conns = _run(svc.list_connections(runtime_status=_idle, runtime_errors=_no_err))
    managed = [c for c in conns if c.id.startswith("managed-")]
    # Exactly 4 managed records, no duplicates.
    assert len(managed) == 4


def test_managed_connections_expose_default_auto_approve(managed_env):
    from backend.services import mcp_connection_service as svc
    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
        MANAGED_GITHUB_ID,
        get_managed_auto_approve,
    )

    _run(ensure_managed_connections())
    conn = _run(
        svc.get_connection_by_id(
            MANAGED_GITHUB_ID, runtime_status=_idle, runtime_errors=_no_err
        )
    )
    assert conn is not None
    assert conn.autoApprove == get_managed_auto_approve(MANAGED_GITHUB_ID)


def test_status_reports_connected_when_provider_configured(managed_env):
    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
        get_managed_connection_status,
        MANAGED_GITHUB_ID,
    )

    _run(ensure_managed_connections())
    status = _run(get_managed_connection_status())
    assert status[MANAGED_GITHUB_ID]["state"] == "connected"


def test_status_reports_not_configured_when_provider_missing(
    fake_keyring, db_path, monkeypatch
):
    import backend.db.connection as conn_mod
    import db.connection as compat_conn_mod

    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)
    monkeypatch.setattr(compat_conn_mod, "DB_PATH", db_path)
    from backend.db.init import init_db

    asyncio.run(init_db())

    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
        get_managed_connection_status,
        MANAGED_GITHUB_ID,
    )

    _run(ensure_managed_connections())
    status = _run(get_managed_connection_status())
    assert status[MANAGED_GITHUB_ID]["state"] == "not_configured"


def test_managed_env_blob_is_empty_in_db(managed_env):
    """Token injection must NOT persist OAuth tokens in conn.env."""
    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
        MANAGED_GITHUB_ID,
    )
    from backend.services import mcp_connection_service as svc

    _run(ensure_managed_connections())
    conn = _run(
        svc.get_connection_by_id(
            MANAGED_GITHUB_ID, runtime_status=_idle, runtime_errors=_no_err
        )
    )
    assert conn is not None
    assert conn.env == {}
    assert conn.envKeys == []


def test_resolve_runtime_env_injects_github_token(managed_env):
    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
        MANAGED_GITHUB_ID,
    )
    from backend.services import mcp_connection_service as svc

    _run(ensure_managed_connections())
    conn = _run(
        svc.get_connection_by_id(
            MANAGED_GITHUB_ID, runtime_status=_idle, runtime_errors=_no_err
        )
    )
    env = _run(svc.resolve_runtime_env(conn))
    assert env["GITHUB_PERSONAL_ACCESS_TOKEN"] == "gtok"


def test_resolve_runtime_env_injects_atlassian_token_and_metadata(managed_env):
    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
        MANAGED_ATLASSIAN_ID,
    )
    from backend.services import mcp_connection_service as svc

    _run(ensure_managed_connections())
    conn = _run(
        svc.get_connection_by_id(
            MANAGED_ATLASSIAN_ID, runtime_status=_idle, runtime_errors=_no_err
        )
    )
    env = _run(svc.resolve_runtime_env(conn))
    assert env["JIRA_API_TOKEN"] == "atok"
    assert env["JIRA_USERNAME"] == "u@example.com"
    assert env["JIRA_URL"].startswith("https://")


def test_resolve_runtime_env_injects_ado_token_and_org(managed_env):
    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
        MANAGED_ADO_ID,
    )
    from backend.services import mcp_connection_service as svc

    _run(ensure_managed_connections())
    conn = _run(
        svc.get_connection_by_id(
            MANAGED_ADO_ID, runtime_status=_idle, runtime_errors=_no_err
        )
    )
    env = _run(svc.resolve_runtime_env(conn))
    assert env["ADO_ACCESS_TOKEN"] == "ado-tok"
    assert env["ADO_ORG"] == "myorg"


def test_resolve_runtime_env_raises_when_token_unavailable(
    fake_keyring, db_path, monkeypatch
):
    import backend.db.connection as conn_mod
    import db.connection as compat_conn_mod

    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)
    monkeypatch.setattr(compat_conn_mod, "DB_PATH", db_path)
    from backend.db.init import init_db

    asyncio.run(init_db())

    from backend.services.mcp.managed_connections import (
        ensure_managed_connections,
        MANAGED_GITHUB_ID,
    )
    from backend.services import mcp_connection_service as svc

    _run(ensure_managed_connections())
    conn = _run(
        svc.get_connection_by_id(
            MANAGED_GITHUB_ID, runtime_status=_idle, runtime_errors=_no_err
        )
    )
    with pytest.raises(PermissionError):
        _run(svc.resolve_runtime_env(conn))


def test_manual_connection_env_unchanged_by_resolver(managed_env):
    from backend.schemas.mcp_models import McpConnectionCreate
    from backend.services import mcp_connection_service as svc

    conn = _run(
        svc.create_connection(
            McpConnectionCreate(
                name="Manual",
                command="/bin/echo",
                args=[],
                env={"CUSTOM_KEY": "v1"},
            )
        )
    )
    env = _run(svc.resolve_runtime_env(conn))
    assert env == {"CUSTOM_KEY": "v1"}
