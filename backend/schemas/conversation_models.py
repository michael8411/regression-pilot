from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

MessageRole = Literal["user", "assistant", "system", "tool"]
AttachmentKind = Literal["ticket", "test_case", "session_ref", "mcp_tool"]


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
    """Optional payload for the streaming endpoint.

    Phase 9c: clients pass `tool_catalog` so the model knows what MCP tools
    are available for this turn. Empty / omitted means "no tools attached".
    """
    tool_catalog: Optional[list[dict[str, Any]]] = None


class CreateAttachmentRequest(BaseModel):
    kind: AttachmentKind
    ref: str


class ToolMessageInput(BaseModel):
    request_id: str = Field(min_length=1, max_length=64)
    tool: str = Field(min_length=1, max_length=128)
    connection_id: str = Field(min_length=1, max_length=64)
    status: Literal["done", "error", "denied"]
    input: Any = None
    output: Any = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None


class ToolCatalogEntry(BaseModel):
    connection_id: str
    tool: str
    description: Optional[str] = None
    schema_: Optional[dict[str, Any]] = Field(default=None, alias="schema")


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
