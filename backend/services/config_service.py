import re
from pathlib import Path

import httpx
import structlog
from google import genai

try:
    from backend.config.settings import Settings, get_settings
    from backend.utils.keyring_store import get_credential, set_credential
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.settings import Settings, get_settings
    from utils.keyring_store import get_credential, set_credential


logger = structlog.get_logger("testdeck.config_service")

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

_FIELD_TO_KEYRING_KEY: dict[str, str] = {
    "jira_base_url": "jira_base_url",
    "jira_email": "jira_email",
    "jira_api_token": "jira_api_token",
    "gemini_api_key": "gemini_api_key",
    "zephyr_base_url": "zephyr_base_url",
    "zephyr_api_token": "zephyr_api_token",
}

_KEYRING_KEY_TO_ENV: dict[str, str] = {
    "jira_base_url": "JIRA_BASE_URL",
    "jira_email": "JIRA_EMAIL",
    "jira_api_token": "JIRA_API_TOKEN",
    "gemini_api_key": "GEMINI_API_KEY",
    "zephyr_base_url": "ZEPHYR_BASE_URL",
    "zephyr_api_token": "ZEPHYR_API_TOKEN",
}


def update_keyring_credentials(updates: dict) -> list[str]:
    """Persist credential updates to the OS keyring."""
    written: list[str] = []
    for field, value in updates.items():
        kr_key = _FIELD_TO_KEYRING_KEY.get(field)
        if kr_key is None:
            continue
        set_credential(kr_key, value)
        written.append(field)

    if written:
        get_settings.cache_clear()
        logger.info("credentials_updated", fields=sorted(written))

    return sorted(written)


def migrate_env_to_keyring() -> bool:
    """Migrate credential fields from `.env` into keyring once."""
    raw_settings = Settings()

    migrated_env_keys: list[str] = []
    for field, kr_key in _FIELD_TO_KEYRING_KEY.items():
        current_value = getattr(raw_settings, field, "") or ""
        if not current_value:
            continue
        if get_credential(kr_key) is not None:
            continue

        set_credential(kr_key, current_value)
        env_key = _KEYRING_KEY_TO_ENV[kr_key]
        migrated_env_keys.append(env_key)

    if not migrated_env_keys:
        return False

    _clear_env_keys(migrated_env_keys)
    get_settings.cache_clear()
    logger.info("credentials_migrated_to_keyring", fields=migrated_env_keys)
    return True


def _clear_env_keys(env_keys: list[str]) -> None:
    """Rewrite each `KEY=...` line in `.env` as `KEY=`."""
    if not ENV_PATH.exists():
        return

    text = ENV_PATH.read_text(encoding="utf-8")
    for env_key in env_keys:
        pattern = re.compile(
            rf"^(?P<key>{re.escape(env_key)})\s*=.*$",
            flags=re.MULTILINE,
        )
        text = pattern.sub(f"{env_key}=", text)

    ENV_PATH.write_text(text, encoding="utf-8")


async def test_jira_connection() -> dict:
    settings = get_settings()
    if not settings.jira_configured:
        return {"ok": False, "error": "Jira credentials not configured"}
    try:
        url = settings.jira_base_url.rstrip("/") + "/rest/api/3/myself"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                url,
                auth=(settings.jira_email, settings.jira_api_token),
            )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "ok": True,
                "display_name": data.get("displayName", ""),
                "email": data.get("emailAddress", ""),
            }
        return {"ok": False, "error": f"HTTP {resp.status_code}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def test_gemini_connection() -> dict:
    settings = get_settings()
    if not settings.gemini_api_key:
        return {"ok": False, "error": "Gemini API key not configured"}
    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        model = await client.aio.models.get(model="gemini-2.5-flash")
        return {"ok": True, "model": model.name}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def test_zephyr_connection() -> dict:
    settings = get_settings()
    if not settings.zephyr_api_token:
        return {"ok": False, "error": "Zephyr API token not configured"}
    try:
        url = settings.zephyr_base_url.rstrip("/") + "/healthcheck"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {settings.zephyr_api_token}"},
            )
        if resp.status_code == 200:
            return {"ok": True}
        return {"ok": False, "error": f"HTTP {resp.status_code}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
