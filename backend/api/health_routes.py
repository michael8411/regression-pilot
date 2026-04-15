from fastapi import APIRouter

try:
    from backend.config.settings import get_settings
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.settings import get_settings

router = APIRouter()


@router.get("/health")
async def health():
    settings = get_settings()
    return {
        "status": "ok",
        "jira_configured": settings.jira_configured,
        "ai_configured": bool(settings.gemini_api_key),
        "zephyr_configured": bool(settings.zephyr_api_token),
    }
