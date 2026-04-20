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
}


class Settings(BaseSettings):
    jira_base_url: str = "https://hcssdev.atlassian.net/"
    jira_email: str = ""
    jira_api_token: str = ""

    gemini_api_key: str = ""

    zephyr_base_url: str = "https://api.zephyrscale.smartbear.com/v2"
    zephyr_api_token: str = ""

    backend_port: int = 8000
    log_level: str = "info"
    app_env: str = "development"
    log_to_file: bool = False

    @property
    def jira_configured(self) -> bool:
        return bool(self.jira_base_url and self.jira_email and self.jira_api_token)

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
            if val:
                object.__setattr__(self, field, val)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
