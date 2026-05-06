import json

import structlog
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

try:
    from backend.schemas.conversation_models import (
        AppendMessageRequest,
        AppendMessageResponse,
        AttachmentResponse,
        ConversationResponse,
        ConversationWithMessagesResponse,
        CreateAttachmentRequest,
        CreateConversationRequest,
        SecretScanWarning,
        StreamMessageRequest,
        UpdateConversationRequest,
    )
    from backend.services import conversation_service
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from schemas.conversation_models import (
        AppendMessageRequest,
        AppendMessageResponse,
        AttachmentResponse,
        ConversationResponse,
        ConversationWithMessagesResponse,
        CreateAttachmentRequest,
        CreateConversationRequest,
        SecretScanWarning,
        StreamMessageRequest,
        UpdateConversationRequest,
    )
    from services import conversation_service


router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = structlog.get_logger("testdeck.conversation_routes")


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    include_archived: bool = Query(False, alias="includeArchived"),
):
    return await conversation_service.list_conversations(
        include_archived=include_archived
    )


@router.post("", response_model=ConversationResponse)
async def create_conversation(req: CreateConversationRequest):
    return await conversation_service.create_conversation(title=req.title)


@router.get("/{cid}", response_model=ConversationWithMessagesResponse)
async def get_conversation(cid: str):
    convo = await conversation_service.get_conversation(cid)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return convo


@router.patch("/{cid}", response_model=ConversationResponse)
async def update_conversation(cid: str, req: UpdateConversationRequest):
    updated = await conversation_service.update_conversation(
        cid, title=req.title, pinned=req.pinned, archived=req.archived
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return updated


@router.delete("/{cid}")
async def delete_conversation(cid: str):
    deleted = await conversation_service.delete_conversation(cid)
    return {"deleted": deleted}


@router.post("/{cid}/messages", response_model=AppendMessageResponse)
async def append_message(cid: str, req: AppendMessageRequest):
    msg, scan = await conversation_service.append_message(
        cid, role=req.role, content=req.content, meta=req.meta
    )
    if msg is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return AppendMessageResponse(
        message=msg,
        secret_scan_warnings=[SecretScanWarning(pattern_name=p) for p in scan],
    )


@router.post("/{cid}/messages/stream")
async def stream_message(cid: str, _req: StreamMessageRequest):
    async def event_generator():
        try:
            async for evt in conversation_service.stream_assistant_reply(cid):
                yield f"data: {json.dumps(evt)}\n\n"
        except Exception as exc:  # last-resort sanitizer
            logger.warning(
                "conversation_stream_uncaught",
                conversation_id=cid,
                error_class=type(exc).__name__,
            )
            yield f"data: {json.dumps({'error': 'Internal error'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/{cid}/attachments", response_model=AttachmentResponse)
async def add_attachment(cid: str, req: CreateAttachmentRequest):
    att = await conversation_service.add_attachment(cid, kind=req.kind, ref=req.ref)
    if att is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return att


@router.delete("/{cid}/attachments/{aid}")
async def remove_attachment(cid: str, aid: str):
    deleted = await conversation_service.remove_attachment(cid, aid)
    return {"deleted": deleted}
