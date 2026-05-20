import httpx
import structlog
from fastapi import APIRouter, HTTPException

try:
    from backend.config.preferences import read_preferences, write_preferences
    from backend.config.settings import get_settings
    from backend.schemas.request_models import (
        CredentialsUpdateRequest,
        DisconnectServiceRequest,
        PreferencesUpdateRequest,
    )
    from backend.schemas.data_models import DataWipeRequest
    from backend.services.config_service import (
        delete_keyring_credentials,
        update_keyring_credentials,
    )
    from backend.services.data_service import export_state, wipe_state
    from backend.services import ado_service, github_service
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.preferences import read_preferences, write_preferences
    from config.settings import get_settings
    from schemas.request_models import (
        CredentialsUpdateRequest,
        DisconnectServiceRequest,
        PreferencesUpdateRequest,
    )
    from schemas.data_models import DataWipeRequest
    from services.config_service import (
        delete_keyring_credentials,
        update_keyring_credentials,
    )
    from services.data_service import export_state, wipe_state
    from services import ado_service, github_service


logger = structlog.get_logger("testdeck.config_routes")
router = APIRouter(prefix="/config", tags=["config"])

_FIELD_TO_KEYRING_KEY: dict[str, str] = {
    "jira_base_url": "jira_base_url",
    "jira_email": "jira_email",
    "jira_api_token": "jira_api_token",
    "gemini_api_key": "gemini_api_key",
    "zephyr_base_url": "zephyr_base_url",
    "zephyr_api_token": "zephyr_api_token",
    "github_access_token": "github_access_token",
    "ado_org": "ado_org",
    "ado_access_token": "ado_access_token",
    "sql_server_connection_string": "sql_server_connection_string",
    "sql_server_database": "sql_server_database",
    "sql_server_schema_allowlist": "sql_server_schema_allowlist",
    "sql_server_table_allowlist": "sql_server_table_allowlist",
    "sql_server_include_procs": "sql_server_include_procs",
}

_SERVICE_FIELDS: dict[str, list[str]] = {
    "jira": ["jira_base_url", "jira_email", "jira_api_token"],
    "github": ["github_access_token"],
    "ado": ["ado_org", "ado_access_token"],
    "gemini": ["gemini_api_key"],
    "zephyr": ["zephyr_base_url", "zephyr_api_token"],
    "sql_server": [
        "sql_server_connection_string",
        "sql_server_database",
        "sql_server_schema_allowlist",
        "sql_server_table_allowlist",
        "sql_server_include_procs",
    ],
}


@router.get("/status")
async def config_status():
    settings = get_settings()
    return {
        "jira": {
            "configured": settings.jira_configured,
            "base_url": settings.jira_base_url or None,
            "email": settings.jira_email or None,
        },
        "github": {
            "configured": settings.github_configured,
        },
        "ado": {
            "configured": settings.ado_configured,
            "org": settings.ado_org or None,
        },
        "ai": {"configured": bool(settings.gemini_api_key)},
        "gemini": {"configured": bool(settings.gemini_api_key)},
        "zephyr": {"configured": bool(settings.zephyr_api_token)},
        "sql_server": {
            "configured": settings.sql_server_configured,
            "database": settings.sql_server_database or None,
            "schema_allowlist": settings.sql_server_schema_allowlist or None,
            "include_procs": settings.sql_server_include_procs,
        },
    }


@router.get("/readiness")
async def config_readiness():
    """Readiness snapshot for the Settings UI.

    Status-only; safe to return to the frontend. Never includes tokens,
    connection strings, passwords, or raw env values.
    """
    try:
        from backend.services import connection_readiness_service
    except ImportError:
        from services import connection_readiness_service
    return await connection_readiness_service.get_readiness()


@router.get("/preferences")
async def get_preferences():
    return read_preferences()


@router.post("/preferences")
async def save_preferences(req: PreferencesUpdateRequest):
    updates = req.model_dump(exclude_none=True)
    return write_preferences(updates)


@router.post("/credentials")
async def update_credentials(req: CredentialsUpdateRequest):
    raw = req.model_dump(exclude_none=True)
    updates: dict[str, str] = {}
    for field, value in raw.items():
        if field not in _FIELD_TO_KEYRING_KEY:
            continue
        str_value = str(value.get_secret_value() if hasattr(value, "get_secret_value") else value)
        if field.endswith("_url"):
            str_value = str_value.rstrip("/")
        elif isinstance(value, bool):
            str_value = "true" if value else "false"
        updates[field] = str_value

    if not updates:
        return {"updated": []}

    written = update_keyring_credentials(updates)
    logger.info("credentials_endpoint_updated", updated=written)

    return {"updated": written}


@router.post("/disconnect")
async def disconnect_service(req: DisconnectServiceRequest):
    fields = _SERVICE_FIELDS.get(req.service, [])
    if not fields:
        raise HTTPException(status_code=400, detail=f"Unknown service: {req.service}")
    cleared = delete_keyring_credentials(fields)
    logger.info("service_disconnected", service=req.service, cleared=cleared)
    return {"service": req.service, "cleared": cleared}


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


@router.get("/test-github")
async def test_github():
    s = get_settings()
    if not s.github_configured:
        raise HTTPException(status_code=422, detail="GitHub access token not configured")
    return await github_service.test_connection()


@router.get("/test-ado")
async def test_ado():
    s = get_settings()
    if not s.ado_configured:
        raise HTTPException(
            status_code=422, detail="Azure DevOps org or token not configured"
        )
    return await ado_service.test_connection()


@router.get("/test-sql-server")
async def test_sql_server():
    """Return a safe, structured SQL Server readiness diagnostic.

    Always returns 200 so the UI can render actionable status without
    treating diagnostics as a transport failure. The response never
    contains connection strings, passwords, or raw ODBC exception text.
    """
    try:
        from backend.services.provider_adapters.sql_server import diagnose_sql_server
    except ImportError:
        from services.provider_adapters.sql_server import diagnose_sql_server

    return await diagnose_sql_server()


@router.get("/github/repos")
async def github_repos():
    return {"repos": await github_service.list_repo_suggestions()}


@router.get("/ado/repos")
async def ado_repos():
    return {"repos": await ado_service.list_repo_suggestions()}


@router.post("/data/export")
async def export_data():
    """Return a JSON snapshot of local data. Tokens are excluded."""
    return await export_state()


@router.post("/data/wipe")
async def wipe_data(req: DataWipeRequest):
    """Wipe all local data tables. Requires `confirmation: "WIPE"`."""
    return await wipe_state(keep_credentials=req.keepCredentials)
