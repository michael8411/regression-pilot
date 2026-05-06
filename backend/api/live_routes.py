from fastapi import APIRouter, HTTPException

try:
    from backend.schemas.live_models import (
        CreateLiveBoardRequest,
        LiveBoardResponse,
        LiveGenerateRequest,
        UpdateLiveBoardRequest,
    )
    from backend.services import ai_service, live_board_service
    from backend.utils.http_errors import upstream_error
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from schemas.live_models import (
        CreateLiveBoardRequest,
        LiveBoardResponse,
        LiveGenerateRequest,
        UpdateLiveBoardRequest,
    )
    from services import ai_service, live_board_service
    from utils.http_errors import upstream_error


router = APIRouter(prefix="/live", tags=["live"])


@router.get("/boards", response_model=list[LiveBoardResponse])
async def list_boards():
    return await live_board_service.list_boards()


@router.post("/boards", response_model=LiveBoardResponse)
async def create_board(req: CreateLiveBoardRequest):
    try:
        return await live_board_service.create_board(
            name=req.name, jql=req.jql, columns=req.columns,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/boards/{board_id}", response_model=LiveBoardResponse)
async def get_board(board_id: str):
    board = await live_board_service.get_board(board_id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@router.patch("/boards/{board_id}", response_model=LiveBoardResponse)
async def update_board(board_id: str, req: UpdateLiveBoardRequest):
    try:
        updated = await live_board_service.update_board(
            board_id,
            name=req.name,
            jql=req.jql,
            columns=req.columns,
            pinned=req.pinned,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Board not found")
    return updated


@router.delete("/boards/{board_id}")
async def delete_board(board_id: str):
    deleted = await live_board_service.delete_board(board_id)
    return {"deleted": deleted}


@router.post("/generate")
async def live_generate(req: LiveGenerateRequest):
    """Generate test cases for a single ticket. Skips grouping."""
    try:
        return await ai_service.generate_test_cases([req.ticket], req.instructions)
    except Exception as e:
        raise upstream_error("Gemini", e)
