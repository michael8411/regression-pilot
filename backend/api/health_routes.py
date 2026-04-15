from fastapi import APIRouter

from config.settings import get_settings

router = APIRouter()


@router.get("/health")
async def health():
    settings = get_settings()
    return {
        "status": "ok",
        "jira_configured": bool(settings.jira_base_url and settings.jira_api_token),
        "ai_configured": bool(settings.gemini_api_key),
        "zephyr_configured": bool(settings.zephyr_api_token),
    }
