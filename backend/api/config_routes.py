from fastapi import APIRouter

from config import get_settings

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/status")
async def config_status():
    settings = get_settings()
    return {
        "jira": {
            "configured": bool(settings.jira_base_url and settings.jira_api_token),
            "base_url": settings.jira_base_url or None,
            "email": settings.jira_email or None,
        },
        "ai": {"configured": bool(settings.gemini_api_key)},
        "zephyr": {"configured": bool(settings.zephyr_api_token)},
    }
