import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from schemas.request_models import ChatRequest, GenerateRequest, GroupTicketsRequest
from services import ai_service
from utils.http_errors import upstream_error

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/generate")
async def generate_test_cases(req: GenerateRequest):
    try:
        return await ai_service.generate_test_cases(req.tickets, req.instructions)
    except Exception as e:
        raise upstream_error("Gemini", e)


@router.post("/group-tickets")
async def group_tickets(req: GroupTicketsRequest):
    try:
        return await ai_service.group_tickets_semantic(req.tickets)
    except Exception as e:
        raise upstream_error("Gemini", e)


@router.post("/chat")
async def chat(req: ChatRequest):
    try:
        response = await ai_service.chat_message(req.messages, req.tickets)
        return {"response": response}
    except Exception as e:
        raise upstream_error("Gemini", e)


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    async def event_generator():
        try:
            async for text in ai_service.stream_chat_message(req.messages, req.tickets):
                yield f"data: {json.dumps({'text': text})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
