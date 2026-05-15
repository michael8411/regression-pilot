from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# =============================================================================
# Live boards
# =============================================================================


class LiveBoardQaStatusMap(BaseModel):
    ready: list[str] = Field(default_factory=list)
    testing: list[str] = Field(default_factory=list)
    done: list[str] = Field(default_factory=list)


BoardBuilderMode = Literal["simple", "advanced"]
LaneGrouping = Literal["none", "epic", "parent", "component"]
AssigneeScope = Literal["anyone", "currentUser"]
BoardColumnMode = Literal["all", "qa"]
BoardDensity = Literal["compact", "cozy", "roomy"]


class LiveBoardProfile(BaseModel):
    builderMode: BoardBuilderMode = "simple"
    projectKey: str = ""
    versionName: str = ""
    selectedStatuses: list[str] = Field(default_factory=list)
    qaStatusMap: LiveBoardQaStatusMap = Field(default_factory=LiveBoardQaStatusMap)
    laneGrouping: LaneGrouping = "none"
    assigneeScope: AssigneeScope = "anyone"
    refreshIntervalSec: int = Field(default=60, ge=5, le=1800)
    customJql: str = ""


class LiveBoardViewPreferences(BaseModel):
    homeFilter: str = ""
    boardColumnMode: BoardColumnMode = "qa"
    density: BoardDensity = "cozy"
    lastOpenedTicketKey: str = ""


class CreateLiveBoardRequest(BaseModel):
    name: str
    jql: str
    columns: Optional[list[str]] = None
    profile: Optional[LiveBoardProfile] = None
    view_prefs: Optional[LiveBoardViewPreferences] = None


class UpdateLiveBoardRequest(BaseModel):
    name: Optional[str] = None
    jql: Optional[str] = None
    columns: Optional[list[str]] = None
    pinned: Optional[bool] = None
    profile: Optional[LiveBoardProfile] = None
    view_prefs: Optional[LiveBoardViewPreferences] = None


class LiveBoardResponse(BaseModel):
    id: str
    name: str
    jql: str
    columns: list[str]
    pinned: bool
    created_at: str
    updated_at: str
    profile: Optional[LiveBoardProfile] = None
    view_prefs: Optional[LiveBoardViewPreferences] = None


# =============================================================================
# Jira passthrough shapes (kept stable)
# =============================================================================


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


# =============================================================================
# Live workflow artifacts — Phase 01 persistence contracts
# =============================================================================


class LivePinnedTicketUpsert(BaseModel):
    board_id: Optional[str] = None
    ticket_snapshot: Optional[dict[str, Any]] = None


class LivePinnedTicket(BaseModel):
    ticket_key: str
    board_id: Optional[str] = None
    ticket_snapshot: Optional[dict[str, Any]] = None
    created_at: str
    updated_at: str


LiveGeneratedCasesStatus = Literal[
    "draft", "exporting", "exported", "failed"
]


class LiveGeneratedCasesCreate(BaseModel):
    ticket_key: str = Field(min_length=1, max_length=64)
    board_id: Optional[str] = None
    instructions: str = ""
    cases: list[Any] = Field(default_factory=list)
    context_metadata: Optional[dict[str, Any]] = None
    export_metadata: Optional[dict[str, Any]] = None
    status: LiveGeneratedCasesStatus = "draft"


class LiveGeneratedCasesPatch(BaseModel):
    instructions: Optional[str] = None
    cases: Optional[list[Any]] = None
    context_metadata: Optional[dict[str, Any]] = None
    export_metadata: Optional[dict[str, Any]] = None
    status: Optional[LiveGeneratedCasesStatus] = None
    exported_at: Optional[str] = None


class LiveGeneratedCases(BaseModel):
    id: str
    ticket_key: str
    board_id: Optional[str] = None
    instructions: str = ""
    cases: list[Any] = Field(default_factory=list)
    context_metadata: Optional[dict[str, Any]] = None
    export_metadata: Optional[dict[str, Any]] = None
    status: LiveGeneratedCasesStatus = "draft"
    exported_at: Optional[str] = None
    created_at: str
    updated_at: str


LiveActivityKind = Literal[
    "board_created",
    "board_updated",
    "ticket_pinned",
    "ticket_unpinned",
    "cases_generated",
    "cases_exported",
    "comment_posted",
    "transition_applied",
    "other",
]


class LiveActivityCreate(BaseModel):
    board_id: Optional[str] = None
    ticket_key: Optional[str] = None
    kind: LiveActivityKind
    summary: str = ""
    detail: str = ""


class LiveActivityEvent(BaseModel):
    id: str
    board_id: Optional[str] = None
    ticket_key: Optional[str] = None
    kind: LiveActivityKind
    summary: str = ""
    detail: str = ""
    created_at: str
