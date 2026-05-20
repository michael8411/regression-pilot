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
    # Phase 13 — additive view prefs. Legacy rows without these fields
    # deserialize cleanly because both have safe defaults.
    showEmptyNonQaColumns: bool = False
    collapsedLaneKeys: list[str] = Field(default_factory=list)


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


# Phase 06c — the Live workflow's primary target is the Jira ticket's
# Test Cases custom field (textarea). Comment publishing is the optional
# fallback. `linked_test_cases` stays in the union so historical drafts
# from earlier phases keep deserializing without crashes.
LivePublishMode = Literal[
    "jira_test_cases_field",
    "jira_comment",
    "linked_test_cases",
]
LivePublishTarget = Literal[
    "jira_test_cases_field",
    "jira_comment",
    "zephyr_linked_tests",
    "none",
]


# Customer-confirmed Jira field for the Live workflow target. Overridable
# per request when a tenant uses a different field id.
DEFAULT_JIRA_TEST_CASES_FIELD_ID = "customfield_11001"


class LivePublishCasesRequest(BaseModel):
    """Payload for `POST /live/generated-cases/{id}/publish`.

    Phase 06c: Live publishes default to the Jira ticket's *Test Cases*
    custom field. Comment publishing is the optional fallback path.
    """

    ticket_key: str = Field(min_length=1, max_length=64)
    project_key: str = Field(min_length=1, max_length=64)
    case_indexes: Optional[list[int]] = None
    """When None or empty, publish all cases in the set."""
    mode: LivePublishMode = "jira_test_cases_field"
    fallback_to_comment: bool = True
    """When the primary `jira_test_cases_field` write fails, automatically
    post the same body as a Jira comment so the customer never loses
    publish progress to a transient field-edit failure."""
    folder_id: Optional[int] = None
    """Optional Zephyr folder for legacy linked-test publishes."""
    confirm_duplicate: bool = False
    """Customer acknowledged the case set was already published."""
    body: Optional[str] = None
    """Optional preformatted Jira-friendly body. Used for both targets so
    the dialog preview matches the posted content byte-for-byte. When
    omitted, the backend formatter renders the body."""
    test_cases_field_id: str = DEFAULT_JIRA_TEST_CASES_FIELD_ID
    """Override the target Jira custom field id per request."""


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


class LiveJiraFieldResult(BaseModel):
    """Sanitized confirmation of a Jira custom-field write."""

    field_id: str
    ticket_key: str
    updated_at: Optional[str] = None


class LivePublishCasesResponse(BaseModel):
    status: LiveGeneratedCasesStatus
    target: LivePublishTarget
    created: int = 0
    created_test_cases: list[LiveCreatedTestCase] = Field(default_factory=list)
    failed: list[LiveFailedPublishCase] = Field(default_factory=list)
    jira_comment: Optional[LiveJiraCommentResult] = None
    jira_field: Optional[LiveJiraFieldResult] = None
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
    jira_field: Optional[LiveJiraFieldResult] = None
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


class LiveCaseUpdateEntry(BaseModel):
    """Phase 06c — surgical replacement of a single case in a saved set.

    Used by the per-case editor so saving one case never overwrites its
    siblings on a stale read of the full list.
    """

    index: int = Field(ge=0)
    case: dict[str, Any]


class LiveGeneratedCasesPatch(BaseModel):
    instructions: Optional[str] = None
    cases: Optional[list[Any]] = None
    case_updates: Optional[list[LiveCaseUpdateEntry]] = None
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
