import re
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

try:
    from backend.config.preferences import read_preferences, write_preferences
    from backend.config.settings import get_settings
    from backend.schemas.request_models import (
        CredentialsUpdateRequest,
        PreferencesUpdateRequest,
    )
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.preferences import read_preferences, write_preferences
    from config.settings import get_settings
    from schemas.request_models import CredentialsUpdateRequest, PreferencesUpdateRequest

router = APIRouter(prefix="/config", tags=["config"])

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

_FIELD_TO_ENV: dict[str, str] = {
    "jira_base_url": "JIRA_BASE_URL",
    "jira_email": "JIRA_EMAIL",
    "jira_api_token": "JIRA_API_TOKEN",
    "gemini_api_key": "GEMINI_API_KEY",
    "zephyr_base_url": "ZEPHYR_BASE_URL",
    "zephyr_api_token": "ZEPHYR_API_TOKEN",
}


# ── /config/status ────────────────────────────────────────────

@router.get("/status")
async def config_status():
    settings = get_settings()
    return {
        "jira": {
            "configured": settings.jira_configured,
            "base_url": settings.jira_base_url or None,
            "email": settings.jira_email or None,
        },
        "ai": {"configured": bool(settings.gemini_api_key)},
        "zephyr": {"configured": bool(settings.zephyr_api_token)},
    }


@router.get("/preferences")
async def get_preferences():
    return read_preferences()


@router.post("/preferences")
async def save_preferences(req: PreferencesUpdateRequest):
    updates = req.model_dump(exclude_none=True)
    return write_preferences(updates)


# ── /config/credentials ───────────────────────────────────────

@router.post("/credentials")
async def update_credentials(req: CredentialsUpdateRequest):
    raw = req.model_dump(exclude_none=True)
    updates: dict[str, str] = {}
    for field, value in raw.items():
        env_key = _FIELD_TO_ENV.get(field)
        if not env_key:
            continue
        # Pydantic may wrap in SecretStr or HttpUrl — get the plain string
        str_value = str(value.get_secret_value() if hasattr(value, "get_secret_value") else value)
        updates[env_key] = str_value.rstrip("/") if field.endswith("_url") else str_value

    if not updates:
        return {"updated": []}

    _write_env(updates)
    get_settings.cache_clear()

    return {"updated": list(updates.keys())}


def _write_env(updates: dict[str, str]) -> None:
    """Update or append key=value lines in the .env file."""
    text = ENV_PATH.read_text(encoding="utf-8") if ENV_PATH.exists() else ""
    lines = text.splitlines(keepends=True)

    for env_key, value in updates.items():
        pattern = re.compile(rf"^{re.escape(env_key)}\s*=.*$", re.MULTILINE)
        new_line = f"{env_key}={value}\n"
        if pattern.search(text):
            lines = [
                new_line if re.match(rf"^{re.escape(env_key)}\s*=", line) else line
                for line in lines
            ]
        else:
            lines.append(new_line)
        text = "".join(lines)

    ENV_PATH.write_text(text, encoding="utf-8")


# ── /config/test-* ────────────────────────────────────────────

@router.get("/test-jira")
async def test_jira():
    s = get_settings()
    if not s.jira_configured:
        raise HTTPException(status_code=422, detail="Jira credentials not configured")
    try:
        async with httpx.AsyncClient(
            auth=(s.jira_email, s.jira_api_token),
            headers={"Accept": "application/json"},
            timeout=10.0,
        ) as client:
            resp = await client.get(f"{s.jira_base_url.rstrip('/')}/rest/api/3/myself")
            resp.raise_for_status()
            data = resp.json()
            return {
                "ok": True,
                "display_name": data.get("displayName"),
                "email": data.get("emailAddress"),
            }
    except httpx.HTTPStatusError as e:
        return {"ok": False, "error": f"Jira returned {e.response.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/test-gemini")
async def test_gemini():
    from google import genai  # noqa: PLC0415

    s = get_settings()
    if not s.gemini_api_key:
        raise HTTPException(status_code=422, detail="Gemini API key not configured")
    try:
        client = genai.Client(api_key=s.gemini_api_key)
        models = client.models.list()
        model_ids = [m.name for m in models]
        return {"ok": True, "model": model_ids[0] if model_ids else "unknown"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/test-zephyr")
async def test_zephyr():
    s = get_settings()
    if not s.zephyr_api_token:
        raise HTTPException(status_code=422, detail="Zephyr token not configured")
    try:
        async with httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {s.zephyr_api_token}",
                "Accept": "application/json",
            },
            timeout=10.0,
        ) as client:
            resp = await client.get(
                f"{s.zephyr_base_url.rstrip('/')}/testcases?maxResults=1"
            )
            resp.raise_for_status()
            return {"ok": True}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "error": f"Zephyr returned {e.response.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
