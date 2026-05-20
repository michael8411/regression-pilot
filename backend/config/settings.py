from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

try:
    from backend.utils.keyring_store import get_credential
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from utils.keyring_store import get_credential


_KEYRING_FIELDS: dict[str, str] = {
    "jira_api_token": "jira_api_token",
    "jira_email": "jira_email",
    "jira_base_url": "jira_base_url",
    "gemini_api_key": "gemini_api_key",
    "zephyr_api_token": "zephyr_api_token",
    "zephyr_base_url": "zephyr_base_url",
    "github_access_token": "github_access_token",
    "ado_org": "ado_org",
    "ado_access_token": "ado_access_token",
    "sql_server_connection_string": "sql_server_connection_string",
    "sql_server_database": "sql_server_database",
    "sql_server_schema_allowlist": "sql_server_schema_allowlist",
    "sql_server_table_allowlist": "sql_server_table_allowlist",
    "sql_server_include_procs": "sql_server_include_procs",
    "jira_dev_status_application_types": "jira_dev_status_application_types",
    # Phase 17 — OAuth app registration values. Not secrets but keyring-
    # backed so the app picks them up without redeploys.
    "oauth_entra_tenant_id": "oauth_entra_tenant_id",
    "oauth_entra_client_id": "oauth_entra_client_id",
    "oauth_github_client_id": "oauth_github_client_id",
    "oauth_atlassian_client_id": "oauth_atlassian_client_id",
    "oauth_redirect_base_url": "oauth_redirect_base_url",
}


class Settings(BaseSettings):
    jira_base_url: str = "https://hcssdev.atlassian.net/"
    jira_email: str = ""
    jira_api_token: str = ""

    gemini_api_key: str = ""

    zephyr_base_url: str = "https://api.zephyrscale.smartbear.com/v2"
    zephyr_api_token: str = ""

    github_access_token: str = ""

    ado_org: str = ""
    ado_access_token: str = ""

    sql_server_connection_string: str = ""
    sql_server_database: str = ""
    sql_server_schema_allowlist: str = "dbo"
    sql_server_table_allowlist: str = ""
    sql_server_include_procs: bool = False

    # Optional override for Jira dev-status applicationType probes.
    # Comma-separated. Merged with built-in defaults at call site so users
    # cannot accidentally drop the standard GitHub/Azure DevOps coverage.
    jira_dev_status_application_types: str = ""

    # Phase 17 — OAuth app registration values.
    oauth_entra_tenant_id: str = ""
    oauth_entra_client_id: str = ""
    oauth_github_client_id: str = ""
    oauth_atlassian_client_id: str = ""
    oauth_redirect_base_url: str = "http://127.0.0.1:8000"

    backend_port: int = 8000
    log_level: str = "info"
    app_env: str = "development"
    log_to_file: bool = False

    # Tenant epic-link custom field. Override via env JIRA_EPIC_LINK_FIELD.
    jira_epic_link_field: str = "customfield_10014"

    @property
    def jira_configured(self) -> bool:
        return bool(self.jira_base_url and self.jira_email and self.jira_api_token)

    @property
    def github_configured(self) -> bool:
        return bool(self.github_access_token)

    @property
    def ado_configured(self) -> bool:
        return bool(self.ado_org and self.ado_access_token)

    @property
    def sql_server_configured(self) -> bool:
        return bool(self.sql_server_connection_string)

    @property
    def oauth_configured(self) -> bool:
        return bool(
            self.oauth_entra_tenant_id
            and self.oauth_entra_client_id
            and self.oauth_github_client_id
            and self.oauth_atlassian_client_id
        )

    def missing_oauth_settings(self) -> list[str]:
        missing: list[str] = []
        if not self.oauth_entra_tenant_id:
            missing.append("oauth_entra_tenant_id")
        if not self.oauth_entra_client_id:
            missing.append("oauth_entra_client_id")
        if not self.oauth_github_client_id:
            missing.append("oauth_github_client_id")
        if not self.oauth_atlassian_client_id:
            missing.append("oauth_atlassian_client_id")
        return missing

    model_config = {
        "env_file": str(Path(__file__).resolve().parent.parent / ".env"),
        "env_file_encoding": "utf-8",
    }

    def model_post_init(self, __context) -> None:
        for field, kr_key in _KEYRING_FIELDS.items():
            try:
                val = get_credential(kr_key)
            except Exception:
                continue
            if not val:
                continue
            # Bool fields stored as "true"/"false" strings in keyring.
            if field == "sql_server_include_procs":
                object.__setattr__(self, field, val.lower() == "true")
            else:
                object.__setattr__(self, field, val)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
