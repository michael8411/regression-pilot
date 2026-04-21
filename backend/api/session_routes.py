import structlog
from fastapi import APIRouter, HTTPException

try:
    from backend.schemas.request_models import CreateSessionRequest, SaveStateRequest
    from backend.services import session_service
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from schemas.request_models import CreateSessionRequest, SaveStateRequest
    from services import session_service

router = APIRouter(prefix="/sessions", tags=["sessions"])
logger = structlog.get_logger("testdeck.session_routes")


def _read_err(exc: Exception) -> HTTPException:
    logger.warning("session_endpoint_failed", error_type=type(exc).__name__)
    return HTTPException(status_code=500, detail="Failed to read session data")


def _write_err(exc: Exception) -> HTTPException:
    logger.warning("session_endpoint_failed", error_type=type(exc).__name__)
    return HTTPException(status_code=500, detail="Failed to save session data")


@router.get("/active")
async def get_active_session():
    try:
        session = await session_service.get_active_session()
    except Exception as exc:
        raise _read_err(exc)
    if session is None:
        raise HTTPException(status_code=404, detail="No active session")
    return session


@router.post("")
async def create_session(req: CreateSessionRequest):
    try:
        return await session_service.create_session(req.project_key, req.version_name)
    except Exception as exc:
        raise _write_err(exc)


@router.get("")
async def list_sessions(limit: int = 20):
    try:
        return await session_service.list_sessions(limit)
    except Exception as exc:
        raise _read_err(exc)


@router.get("/{session_id}")
async def get_session_by_id(session_id: str):
    try:
        session = await session_service.get_session_by_id(session_id)
    except Exception as exc:
        raise _read_err(exc)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.put("/{session_id}/state")
async def save_state(session_id: str, req: SaveStateRequest):
    try:
        if req.items is not None:
            if req.key is not None or req.value is not None:
                raise HTTPException(status_code=400, detail="Provide either items or key/value, not both")
            warnings = await session_service.save_state_batch(session_id, req.items)
        elif req.key is None or req.value is None:
            raise HTTPException(status_code=400, detail="Provide both key and value")
        else:
            warnings = await session_service.save_state(session_id, req.key, req.value)
    except HTTPException:
        raise
    except Exception as exc:
        raise _write_err(exc)
    return {"saved": True, "secret_scan_warnings": warnings}


@router.post("/{session_id}/activate")
async def activate_session(session_id: str):
    try:
        session = await session_service.activate_session(session_id)
    except Exception as exc:
        raise _write_err(exc)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    try:
        await session_service.delete_session(session_id)
    except Exception as exc:
        raise _write_err(exc)
    return {"deleted": True}
