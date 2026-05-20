from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


McpTransport = Literal["stdio", "http", "sse"]


class McpConnectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    # `command` is required for stdio transports; HTTP/SSE use `url` instead.
    # We keep `command` non-optional but allow an empty string for url-based
    # transports so existing stdio callers continue to validate unchanged.
    command: str = Field(default="", max_length=512)
    args: List[str] = Field(default_factory=list)
    env: Dict[str, str] = Field(default_factory=dict)
    enabled: bool = True
    autoApprove: List[str] = Field(default_factory=list)
    transport: McpTransport = "stdio"
    url: str = Field(default="", max_length=2048)

    @model_validator(mode="after")
    def _validate_transport(self):
        if self.transport == "stdio":
            if not self.command:
                raise ValueError("stdio transport requires a command")
        else:
            if not self.url:
                raise ValueError(f"{self.transport} transport requires a url")
        return self

    @field_validator("args")
    @classmethod
    def _bound_args(cls, v: List[str]) -> List[str]:
        if len(v) > 64:
            raise ValueError("too many args")
        for arg in v:
            if not isinstance(arg, str) or len(arg) > 4096:
                raise ValueError("arg too long")
        return v

    @field_validator("env")
    @classmethod
    def _bound_env(cls, v: Dict[str, str]) -> Dict[str, str]:
        if len(v) > 64:
            raise ValueError("too many env vars")
        for key, val in v.items():
            if not key or len(key) > 256 or len(val) > 8192:
                raise ValueError("env entry too large")
            if not key.replace("_", "").isalnum():
                raise ValueError(f"invalid env key: {key!r}")
        return v

    @field_validator("autoApprove")
    @classmethod
    def _bound_auto_approve(cls, v: List[str]) -> List[str]:
        if len(v) > 256:
            raise ValueError("too many auto-approve entries")
        for entry in v:
            if not isinstance(entry, str) or len(entry) > 256:
                raise ValueError("auto-approve entry too long")
        return v


class McpConnectionPatch(BaseModel):
    name: Optional[str] = None
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    enabled: Optional[bool] = None
    autoApprove: Optional[List[str]] = None
    transport: Optional[McpTransport] = None
    url: Optional[str] = Field(default=None, max_length=2048)

    @field_validator("args")
    @classmethod
    def _bound_args(cls, v):
        if v is None:
            return v
        if len(v) > 64:
            raise ValueError("too many args")
        for arg in v:
            if not isinstance(arg, str) or len(arg) > 4096:
                raise ValueError("arg too long")
        return v

    @field_validator("env")
    @classmethod
    def _bound_env(cls, v):
        if v is None:
            return v
        if len(v) > 64:
            raise ValueError("too many env vars")
        for key, val in v.items():
            if not key or len(key) > 256 or len(val) > 8192:
                raise ValueError("env entry too large")
            if not key.replace("_", "").isalnum():
                raise ValueError(f"invalid env key: {key!r}")
        return v


class McpConnection(BaseModel):
    id: str
    name: str
    command: str
    args: List[str]
    env: Dict[str, str]
    envKeys: List[str]
    enabled: bool
    autoApprove: List[str]
    status: Literal["idle", "running", "error"]
    lastError: Optional[str] = None
    createdAt: str
    updatedAt: str
    transport: McpTransport = "stdio"
    url: str = ""


class McpTool(BaseModel):
    name: str
    description: Optional[str] = None
    inputSchema: Dict[str, Any] = Field(default_factory=dict)


class McpTestResult(BaseModel):
    ok: bool
    toolCount: int
    duration_ms: int
    error: Optional[str] = None


class McpInvokeRequest(BaseModel):
    requestId: str = Field(min_length=1, max_length=64)
    input: Any = None


class McpInvokeResponse(BaseModel):
    ok: bool
    output: Any = None
    error: Optional[str] = None
    duration_ms: int
