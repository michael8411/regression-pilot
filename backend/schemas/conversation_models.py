from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

MessageRole = Literal["user", "assistant", "system", "tool"]
AttachmentKind = Literal["ticket", "test_case", "session_ref"]


class CreateConversationRequest(BaseModel):
    title: Optional[str] = None


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None
    archived: Optional[bool] = None


class AppendMessageRequest(BaseModel):
    role: MessageRole = "user"
    content: str
    meta: dict[str, Any] = Field(default_factory=dict)


class StreamMessageRequest(BaseModel):
    """No fields. Reserved for future overrides."""
    pass


class CreateAttachmentRequest(BaseModel):
    kind: AttachmentKind
    ref: str


class ConversationResponse(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    pinned: bool
    archived: bool
    meta: dict[str, Any]


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: MessageRole
    content: str
    created_at: str
    meta: dict[str, Any]


class AttachmentResponse(BaseModel):
    id: str
    conversation_id: str
    kind: AttachmentKind
    ref: str
    created_at: str


class ConversationWithMessagesResponse(BaseModel):
    conversation: ConversationResponse
    messages: list[MessageResponse]
    attachments: list[AttachmentResponse]


class SecretScanWarning(BaseModel):
    pattern_name: str


class AppendMessageResponse(BaseModel):
    message: MessageResponse
    secret_scan_warnings: list[SecretScanWarning] = Field(default_factory=list)
