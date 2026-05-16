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
    "draft",
    "exporting",
    "exported",
    "failed",
    # Phase 06b — publish-to-Jira status states.
    "accepted",
    "partial_export",
    "commented",
    "discarded",
]


# =============================================================================
# Phase 06b — publish-to-Jira contracts
# =============================================================================


LivePublishMode = Literal["linked_test_cases", "jira_comment"]
LivePublishTarget = Literal[
    "zephyr_linked_tests", "jira_comment", "none"
]


class LivePublishCasesRequest(BaseModel):
    """Payload for `POST /live/generated-cases/{id}/publish`."""

    ticket_key: str = Field(min_length=1, max_length=64)
    project_key: str = Field(min_length=1, max_length=64)
    case_indexes: Optional[list[int]] = None
    """When None or empty, publish all cases in the set."""
    mode: LivePublishMode = "linked_test_cases"
    fallback_to_comment: bool = True
    folder_id: Optional[int] = None
    """Optional Zephyr folder for created test cases."""
    confirm_duplicate: bool = False
    """Customer acknowledged the case set was already published."""


class LiveCreatedTestCase(BaseModel):
    """A test case successfully created by Zephyr."""

    name: str
    key: Optional[str] = None
    id: Optional[str] = None
    self_url: Optional[str] = None
    """Zephyr-provided self link; may be missing for some Zephyr versions."""


class LiveFailedPublishCase(BaseModel):
    """A test case that could not be created or linked."""

    name: str
    error: str


class LiveJiraCommentResult(BaseModel):
    """Sanitized Jira comment metadata returned to the UI."""

    id: str
    ticket_key: str
    author: Optional[str] = None
    created: Optional[str] = None
    url: Optional[str] = None


class LivePublishCasesResponse(BaseModel):
    status: LiveGeneratedCasesStatus
    target: LivePublishTarget
    created: int = 0
    created_test_cases: list[LiveCreatedTestCase] = Field(default_factory=list)
    failed: list[LiveFailedPublishCase] = Field(default_factory=list)
    jira_comment: Optional[LiveJiraCommentResult] = None
    appears_on_jira_ticket: bool = False
    duplicate_attempt: bool = False
    message: Optional[str] = None
    exported_at: Optional[str] = None


class LiveExportMetadata(BaseModel):
    """Persisted on `live_generated_cases.export_metadata`. Encrypted at rest."""

    target: LivePublishTarget
    source_ticket_key: str
    project_key: str = ""
    selected_case_indexes: list[int] = Field(default_factory=list)
    created_test_cases: list[LiveCreatedTestCase] = Field(default_factory=list)
    failed: list[LiveFailedPublishCase] = Field(default_factory=list)
    jira_comment: Optional[LiveJiraCommentResult] = None
    appears_on_jira_ticket: bool = False
    published_at: str
    duplicate_attempt: bool = False


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
