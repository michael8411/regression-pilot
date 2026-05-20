import asyncio

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "tool_catalog_test.db"


def _force_settings(values: dict) -> None:
    from config.settings import get_settings

    get_settings.cache_clear()
    s = get_settings()
    for k, v in values.items():
        object.__setattr__(s, k, v)


@pytest.fixture
def cat_env(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod

    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)
    from db.init import init_db

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
    from config.settings import get_settings

    get_settings.cache_clear()


def _run(coro):
    return asyncio.run(coro)


def _patch_runtime_tools(monkeypatch, tools_by_conn):
    from services.mcp import tool_catalog_service as mod

    async def fake_list_tools(cid):
        return list(tools_by_conn.get(cid, []))

    monkeypatch.setattr(mod, "_safe_list_tools", fake_list_tools)


def test_select_providers_picks_jira_on_ticket_keys():
    from services.mcp.tool_catalog_service import select_providers
    from services.mcp.managed_connections import MANAGED_ATLASSIAN_ID

    assert MANAGED_ATLASSIAN_ID in select_providers(
        "What is MOB-1234 about?", []
    )


def test_select_providers_picks_code_on_pr_keywords():
    from services.mcp.tool_catalog_service import select_providers
    from services.mcp.managed_connections import (
        MANAGED_GITHUB_ID,
        MANAGED_ADO_ID,
    )

    out = select_providers("What changed in PR 123?", [])
    assert MANAGED_GITHUB_ID in out
    assert MANAGED_ADO_ID in out


def test_select_providers_picks_sql_on_schema_keywords():
    from services.mcp.tool_catalog_service import select_providers
    from services.mcp.managed_connections import MANAGED_SQL_SERVER_ID

    assert MANAGED_SQL_SERVER_ID in select_providers(
        "What table stores pay adjustments?", []
    )


def test_select_providers_ignores_unrelated_chatter():
    from services.mcp.tool_catalog_service import select_providers

    assert select_providers("hi, can you help me?", []) == []


def test_build_catalog_filters_blocked_tools(cat_env, monkeypatch):
    from services.mcp.tool_catalog_service import build_assistant_tool_catalog
    from services.mcp.managed_connections import (
        ensure_managed_connections,
        MANAGED_GITHUB_ID,
    )

    _run(ensure_managed_connections())
    _patch_runtime_tools(
        monkeypatch,
        {
            MANAGED_GITHUB_ID: [
                {"name": "get_pull_request", "description": "read PR", "inputSchema": {}},
                {"name": "create_issue", "description": "write issue", "inputSchema": {}},
                {"name": "update_pull_request", "description": "write", "inputSchema": {}},
            ]
        },
    )

    catalog = _run(
        build_assistant_tool_catalog(
            "c1",
            user_message="open PR 42 diff",
            attached_tool_refs=[],
        )
    )
    names = {e["tool"] for e in catalog}
    assert "get_pull_request" in names
    assert "create_issue" not in names
    assert "update_pull_request" not in names


def test_build_catalog_keeps_manual_safe_tools(cat_env, monkeypatch):
    from services.mcp.tool_catalog_service import build_assistant_tool_catalog

    _patch_runtime_tools(monkeypatch, {})
    catalog = _run(
        build_assistant_tool_catalog(
            "c1",
            user_message="random message",
            attached_tool_refs=[
                {
                    "connection_id": "manual-1",
                    "tool": "search_things",
                    "description": "manual",
                    "inputSchema": {},
                }
            ],
        )
    )
    assert any(
        e["connection_id"] == "manual-1" and e["tool"] == "search_things"
        for e in catalog
    )


def test_build_catalog_filters_manual_blocked_tools(cat_env, monkeypatch):
    from services.mcp.tool_catalog_service import build_assistant_tool_catalog

    _patch_runtime_tools(monkeypatch, {})
    catalog = _run(
        build_assistant_tool_catalog(
            "c1",
            user_message="random",
            attached_tool_refs=[
                {
                    "connection_id": "manual-1",
                    "tool": "delete_everything",
                    "description": "danger",
                    "inputSchema": {},
                }
            ],
        )
    )
    assert all(e["tool"] != "delete_everything" for e in catalog)


def test_safety_classifier_blocks_writes_globally():
    from services.mcp import tool_safety

    assert tool_safety.is_blocked("create_issue")
    assert tool_safety.is_blocked("update_record")
    assert tool_safety.is_blocked("delete_table")
    assert tool_safety.is_blocked("transition_status")
    assert tool_safety.is_blocked("merge_pr")
    assert not tool_safety.is_blocked("get_thing")


def test_safety_classifier_provider_safelist():
    from services.mcp import tool_safety
    from services.mcp.managed_connections import MANAGED_SQL_SERVER_ID

    assert tool_safety.is_auto_catalog_safe(
        MANAGED_SQL_SERVER_ID, "describe_table"
    )
    assert not tool_safety.is_auto_catalog_safe(
        MANAGED_SQL_SERVER_ID, "run_query"
    )
