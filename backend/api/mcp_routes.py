import time

import structlog
from fastapi import APIRouter, HTTPException

try:
    from backend.schemas.mcp_models import (
        McpConnection,
        McpConnectionCreate,
        McpConnectionPatch,
        McpInvokeRequest,
        McpInvokeResponse,
        McpTestResult,
        McpTool,
    )
    from backend.services import mcp_connection_service as svc
    from backend.services import observability_service as obs
    from backend.services.mcp.runtime import get_runtime
    from backend.services.mcp.managed_connections import (
        is_reserved_managed_id,
        get_managed_connection_status,
    )
    from backend.services.mcp import tool_safety
except ImportError:  # pragma: no cover
    from schemas.mcp_models import (
        McpConnection,
        McpConnectionCreate,
        McpConnectionPatch,
        McpInvokeRequest,
        McpInvokeResponse,
        McpTestResult,
        McpTool,
    )
    from services import mcp_connection_service as svc
    from services import observability_service as obs
    from services.mcp.runtime import get_runtime
    from services.mcp.managed_connections import (
        is_reserved_managed_id,
        get_managed_connection_status,
    )
    from services.mcp import tool_safety


router = APIRouter(prefix="/mcp", tags=["mcp"])
logger = structlog.get_logger("testdeck.mcp.routes")


def _runtime():
    rt = get_runtime()
    return rt.status_for, rt.last_error_for


@router.get("/connections", response_model=list[McpConnection])
async def list_connections():
    status, error = _runtime()
    return await svc.list_connections(
        runtime_status=status, runtime_errors=error
    )


@router.post("/connections", response_model=McpConnection)
async def create_connection(payload: McpConnectionCreate):
    # Reserve the `managed-` prefix for backend-provisioned records.
    return await svc.create_connection(payload)


@router.get("/assistant/status")
async def assistant_status():
    return {
        "providers": await get_managed_connection_status(),
    }


@router.get("/connections/{conn_id}", response_model=McpConnection)
async def get_connection(conn_id: str):
    status, error = _runtime()
    conn = await svc.get_connection_by_id(
        conn_id, runtime_status=status, runtime_errors=error
    )
    if conn is None:
        raise HTTPException(status_code=404, detail="connection_not_found")
    return conn


@router.patch("/connections/{conn_id}", response_model=McpConnection)
async def patch_connection(conn_id: str, payload: McpConnectionPatch):
    if is_reserved_managed_id(conn_id):
        raise HTTPException(
            status_code=409,
            detail="managed_connection_immutable",
        )
    conn = await svc.patch_connection(conn_id, payload)
    if conn is None:
        raise HTTPException(status_code=404, detail="connection_not_found")
    # Patching may change command/env — kill any running client.
    await get_runtime().disconnect(conn_id)
    return conn


@router.delete("/connections/{conn_id}")
async def delete_connection(conn_id: str):
    if is_reserved_managed_id(conn_id):
        raise HTTPException(
            status_code=409,
            detail="managed_connection_immutable",
        )
    await get_runtime().disconnect(conn_id)
    deleted = await svc.delete_connection(conn_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="connection_not_found")
    return {"deleted": True}


@router.post("/connections/{conn_id}/test", response_model=McpTestResult)
async def test_connection(conn_id: str):
    status, error = _runtime()
    conn = await svc.get_connection_by_id(
        conn_id, runtime_status=status, runtime_errors=error
    )
    if conn is None:
        raise HTTPException(status_code=404, detail="connection_not_found")
    result = await get_runtime().test(conn_id)
    return McpTestResult(**result)


@router.get("/connections/{conn_id}/tools", response_model=list[McpTool])
async def list_tools(conn_id: str, refresh: bool = False):
    status, error = _runtime()
    conn = await svc.get_connection_by_id(
        conn_id, runtime_status=status, runtime_errors=error
    )
    if conn is None:
        raise HTTPException(status_code=404, detail="connection_not_found")
    if not conn.enabled:
        raise HTTPException(status_code=409, detail="connection_disabled")
    try:
        tools = await get_runtime().list_tools(conn_id, force_refresh=refresh)
    except (LookupError, PermissionError) as e:
        raise HTTPException(status_code=409, detail=str(e))
    except (ConnectionError, RuntimeError, TimeoutError, FileNotFoundError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    return [McpTool(**t) for t in tools]


@router.post(
    "/connections/{conn_id}/tools/{tool}/invoke",
    response_model=McpInvokeResponse,
)
async def invoke_tool(conn_id: str, tool: str, payload: McpInvokeRequest):
    status, error = _runtime()
    conn = await svc.get_connection_by_id(
        conn_id, runtime_status=status, runtime_errors=error
    )
    if conn is None:
        raise HTTPException(status_code=404, detail="connection_not_found")
    if not conn.enabled:
        raise HTTPException(status_code=409, detail="connection_disabled")

    # Block clearly write-capable tools at the API edge — the Assistant
    # auto catalog already filters these out, but a custom tool ref could
    # still try to invoke one. Manual invocations from the MCP panel are
    # not affected because the panel calls a different (advanced) path.
    if tool_safety.is_blocked(tool):
        return McpInvokeResponse(
            ok=False,
            error=f"tool_blocked_by_safety_policy:{tool}",
            duration_ms=0,
        )

    start = time.monotonic()
    try:
        result = await get_runtime().invoke(conn_id, tool, payload.input)
        duration_ms = int((time.monotonic() - start) * 1000)
        # Budget output before sending to the frontend so the client never
        # holds a payload bigger than the persistence budget allows.
        try:
            from backend.services.mcp.tool_output_budget import budget_tool_output
        except ImportError:  # pragma: no cover
            from services.mcp.tool_output_budget import budget_tool_output
        budgeted, _ = budget_tool_output(result)
        logger.info(
            "mcp_invoke_ok",
            connection_id=conn_id,
            tool_name=tool,
            duration_ms=duration_ms,
        )
        obs.assistant_tool_invoked(
            conversation_id=payload.requestId,
            connection_id=conn_id,
            tool=tool,
            duration_ms=duration_ms,
            ok=True,
        )
        return McpInvokeResponse(ok=True, output=budgeted, duration_ms=duration_ms)
    except TimeoutError as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        logger.warning(
            "mcp_invoke_timeout",
            connection_id=conn_id,
            tool_name=tool,
            duration_ms=duration_ms,
        )
        return McpInvokeResponse(
            ok=False, error=str(e), duration_ms=duration_ms
        )
    except (
        LookupError,
        PermissionError,
        ConnectionError,
        RuntimeError,
        FileNotFoundError,
    ) as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        logger.warning(
            "mcp_invoke_failed",
            connection_id=conn_id,
            tool_name=tool,
            error_class=type(e).__name__,
            duration_ms=duration_ms,
        )
        obs.assistant_tool_invoked(
            conversation_id=payload.requestId,
            connection_id=conn_id,
            tool=tool,
            duration_ms=duration_ms,
            ok=False,
            error_code=type(e).__name__,
        )
        return McpInvokeResponse(
            ok=False, error=str(e), duration_ms=duration_ms
        )
