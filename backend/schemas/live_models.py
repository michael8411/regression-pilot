from typing import Optional
from pydantic import BaseModel, Field


class CreateLiveBoardRequest(BaseModel):
    name: str
    jql: str
    columns: Optional[list[str]] = None


class UpdateLiveBoardRequest(BaseModel):
    name: Optional[str] = None
    jql: Optional[str] = None
    columns: Optional[list[str]] = None
    pinned: Optional[bool] = None


class LiveBoardResponse(BaseModel):
    id: str
    name: str
    jql: str
    columns: list[str]
    pinned: bool
    created_at: str
    updated_at: str


class JiraCommentRequest(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)


class JiraCommentResponse(BaseModel):
    id: str
    author: str
    created: str
    # body intentionally omitted — see master §6


class JiraTransitionTarget(BaseModel):
    id: str
    name: str


class JiraTransitionResponse(BaseModel):
    id: str
    name: str
    to: JiraTransitionTarget


class JiraTransitionRequest(BaseModel):
    transitionId: str


class JiraTransitionResult(BaseModel):
    ok: bool
    skipped: bool = False


class BoardResponse(BaseModel):
    total: int
    by_status: dict[str, list[dict]]
    fetched_at: str


class LiveGenerateRequest(BaseModel):
    ticket: dict
    instructions: str = ""


class SecretScanWarning(BaseModel):
    pattern_name: str


class JiraCommentSubmitResponse(BaseModel):
    comment: JiraCommentResponse
    secret_scan_warnings: list[SecretScanWarning] = Field(default_factory=list)
