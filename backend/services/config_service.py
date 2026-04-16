import re
from pathlib import Path

import httpx
from google import genai

try:
    from backend.config.settings import get_settings
except ImportError:
    from config.settings import get_settings

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

# Mapping from CredentialsUpdateRequest fields to .env variable names
_FIELD_TO_ENV = {
    "jira_base_url": "JIRA_BASE_URL",
    "jira_email": "JIRA_EMAIL",
    "jira_api_token": "JIRA_API_TOKEN",
    "gemini_api_key": "GEMINI_API_KEY",
    "zephyr_api_token": "ZEPHYR_API_TOKEN",
}


def update_env_credentials(updates: dict) -> list[str]:
    mapped = {}
    for field, value in updates.items():
        env_key = _FIELD_TO_ENV.get(field)
        if env_key is not None:
            mapped[env_key] = value

    if not mapped:
        return []

    lines: list[str] = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines(keepends=True)

    updated_keys: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        match = re.match(r"^([A-Z_][A-Z0-9_]*)=", line.strip())
        if match and match.group(1) in mapped:
            key = match.group(1)
            new_lines.append(f"{key}={mapped[key]}\n")
            updated_keys.add(key)
        else:
            new_lines.append(line if line.endswith("\n") else line + "\n")

    for key, value in mapped.items():
        if key not in updated_keys:
            new_lines.append(f"{key}={value}\n")
            updated_keys.add(key)

    ENV_PATH.write_text("".join(new_lines), encoding="utf-8")

    get_settings.cache_clear()

    return sorted(updated_keys)


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
