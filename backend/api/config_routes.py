from fastapi import APIRouter

try:
    from backend.config.settings import get_settings
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.settings import get_settings

router = APIRouter(prefix="/config", tags=["config"])


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
