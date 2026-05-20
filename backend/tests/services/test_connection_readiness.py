"""Connection readiness — assembly tests over fake settings + fake managed MCP."""

from __future__ import annotations

import asyncio

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "readiness_test.db"


@pytest.fixture
def base_env(fake_keyring, db_path, monkeypatch):
    """Fresh DB so manual MCP count works; reload settings."""
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)
    from db.init import init_db
    asyncio.run(init_db())

    from config.settings import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _force_settings(values: dict, fake_keyring=None) -> None:
    """Write values through the fake keyring so Settings.model_post_init picks
    them up. Falls back to object.__setattr__ when the caller didn't pass
    the fixture (kept for ad-hoc test additions)."""
    from config.settings import get_settings
    if fake_keyring is not None:
        for k, v in values.items():
            fake_keyring.set_password("testdeck", k, str(v))
    get_settings.cache_clear()
    if fake_keyring is None:
        s = get_settings()
        for k, v in values.items():
            object.__setattr__(s, k, v)


def _run(coro):
    return asyncio.run(coro)


def _stub_managed_status(monkeypatch, provider_states: dict):
    """Patch managed connection status to a deterministic shape."""
    async def _fake_status():
        out = {}
        for provider, state in provider_states.items():
            cid = f"managed-{provider}"
            out[cid] = {
                "provider": provider,
                "connection_id": cid,
                "configured": state == "connected",
                "state": state,
                "auto_approve": [],
            }
        return out

    monkeypatch.setattr(
        "services.connection_readiness_service.get_managed_connection_status",
        _fake_status,
    )


# ---------------------------------------------------------------------------
# OAuth section
# ---------------------------------------------------------------------------


class TestOauthReadiness:
    def test_oauth_missing_is_informational(self, base_env, monkeypatch):
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        oauth = result["oauth"]
        assert oauth["configured"] is False
        assert oauth["usable_for_signin"] is False
        # Informational message — must not call it failed.
        assert "not set up yet" in oauth["message"].lower()
        assert "fail" not in oauth["message"].lower()
        # Lists missing fields so the UI can disclose them.
        assert "oauth_entra_tenant_id" in oauth["missing_settings"]

    def test_oauth_configured(self, base_env, fake_keyring, monkeypatch):
        _force_settings(
            {
                "oauth_entra_tenant_id": "t",
                "oauth_entra_client_id": "c",
                "oauth_github_client_id": "g",
                "oauth_atlassian_client_id": "a",
            },
            fake_keyring=fake_keyring,
        )
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        assert result["oauth"]["usable_for_signin"] is True
        assert result["oauth"]["missing_settings"] == []


# ---------------------------------------------------------------------------
# Live + Regression sections
# ---------------------------------------------------------------------------


class TestLiveReadiness:
    def test_no_jira_marks_not_ready(self, base_env, monkeypatch):
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        assert result["live_generation"]["state"] == "not_ready"
        assert "Jira" in result["live_generation"]["summary"]

    def test_jira_only_marks_partial(self, base_env, fake_keyring, monkeypatch):
        _force_settings(
            {
                "jira_base_url": "https://acme.atlassian.net/",
                "jira_email": "u@example.com",
                "jira_api_token": "tok",
            },
            fake_keyring=fake_keyring,
        )
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        live = result["live_generation"]
        assert live["state"] == "partial"
        assert live["providers"]["jira"]["usable"] is True
        assert live["providers"]["jira"]["auth_mode"] == "manual"
        assert live["providers"]["github"]["usable"] is False
        # SQL absence does not break Live readiness.
        assert "required" not in live["providers"]["sql_server"]["message"].lower()

    def test_jira_plus_github_marks_ready(self, base_env, fake_keyring, monkeypatch):
        _force_settings(
            {
                "jira_base_url": "https://acme.atlassian.net/",
                "jira_email": "u@example.com",
                "jira_api_token": "tok",
                "github_access_token": "gtok",
            },
            fake_keyring=fake_keyring,
        )
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        live = result["live_generation"]
        assert live["state"] == "ready"
        assert live["providers"]["github"]["usable"] is True

    def test_sql_configured_marks_sql_usable(self, base_env, fake_keyring, monkeypatch):
        _force_settings(
            {
                "jira_base_url": "https://acme.atlassian.net/",
                "jira_email": "u@example.com",
                "jira_api_token": "tok",
                "sql_server_connection_string": "Driver={x};Server=x;",
            },
            fake_keyring=fake_keyring,
        )
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        sql = result["live_generation"]["providers"]["sql_server"]
        assert sql["usable"] is True
        assert sql["auth_mode"] == "connection_string"

    def test_zephyr_missing_does_not_block_live(self, base_env, fake_keyring, monkeypatch):
        _force_settings(
            {
                "jira_base_url": "https://acme.atlassian.net/",
                "jira_email": "u@example.com",
                "jira_api_token": "tok",
                "github_access_token": "gtok",
            },
            fake_keyring=fake_keyring,
        )
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        live = result["live_generation"]
        assert live["state"] == "ready"
        zephyr = live["providers"]["zephyr"]
        assert zephyr["usable"] is False
        # Zephyr being missing is described as optional, never blocking.
        assert "optional" in zephyr["message"].lower()


class TestRegressionMirrorsLive:
    def test_regression_jira_required(self, base_env, monkeypatch):
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        assert result["regression"]["state"] == "not_ready"


# ---------------------------------------------------------------------------
# Assistant MCP
# ---------------------------------------------------------------------------


class TestAssistantMcpReadiness:
    def test_managed_state_surfaced(self, base_env, monkeypatch):
        _stub_managed_status(
            monkeypatch,
            {
                "atlassian": "connected",
                "github": "not_configured",
                "ado": "not_configured",
                "sql_server": "not_configured",
            },
        )
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        mcp = result["assistant_mcp"]
        assert mcp["state"] == "partial"
        atl = mcp["managed_connections"]["managed-atlassian"]
        assert atl["state"] == "connected"
        # Connected message reads as available.
        assert "available" in atl["message"].lower()

    def test_no_managed_no_manual_not_ready(self, base_env, monkeypatch):
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        mcp = result["assistant_mcp"]
        assert mcp["state"] == "not_ready"
        assert mcp["manual_connections_count"] == 0

    def test_manual_connection_count(self, base_env, monkeypatch):
        # Insert a non-managed row directly.
        import db.connection as conn_mod
        async def _insert():
            async with conn_mod.get_connection() as db:
                await db.execute(
                    "INSERT INTO mcp_connections (id, name, transport, command, args, env, enabled, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ("custom-1", "Custom", "stdio", "echo", "[]", "{}", 1, "now", "now"),
                )
                await db.commit()
        _run(_insert())

        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        assert result["assistant_mcp"]["manual_connections_count"] == 1


# ---------------------------------------------------------------------------
# Secret safety
# ---------------------------------------------------------------------------


class TestSecretSafety:
    def test_response_does_not_include_token_values(self, base_env, fake_keyring, monkeypatch):
        _force_settings(
            {
                "jira_base_url": "https://acme.atlassian.net/",
                "jira_email": "u@example.com",
                "jira_api_token": "supersecret-token-AAA",
                "github_access_token": "ghs_SECRETTOKEN_999",
                "ado_access_token": "ado-secret-XYZ",
                "sql_server_connection_string": "Driver={x};Server=secret-host;PWD=hunter2;",
                "gemini_api_key": "AIzaSECRET",
                "zephyr_api_token": "zsecret",
            },
            fake_keyring=fake_keyring,
        )
        _stub_managed_status(monkeypatch, {})
        from services.connection_readiness_service import get_readiness
        result = _run(get_readiness())
        serialized = str(result)
        for needle in [
            "supersecret-token-AAA",
            "ghs_SECRETTOKEN_999",
            "ado-secret-XYZ",
            "hunter2",
            "secret-host",
            "AIzaSECRET",
            "zsecret",
        ]:
            assert needle not in serialized, f"leak: {needle}"
