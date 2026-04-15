from functools import lru_cache

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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
