from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings


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


@lru_cache()
def get_settings() -> Settings:
    return Settings()
