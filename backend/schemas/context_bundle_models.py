"""Normalized ContextBundle schema — Phase 1 of MCP refactor.

This is the single shape the prompt builder reads. All provider adapters
must convert their raw payloads to this shape before assembly. Once the
bundle is built, the prompt assembler must never look at raw provider
responses again.

Determinism notes:
- All list fields use stable ordering; adapters MUST sort before populating.
- Numeric counters (latency_ms, char counts) are recorded in tool_trace only,
  not mixed into model-facing text.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


RepoPlatform = Literal["github", "ado", "none"]
ProviderName = Literal[
    "atlassian",
    "github",
    "ado",
    "sql_server",
    "zephyr_read",
]
RoutingReasonCode = Literal[
    "always_first",
    "pr_link_present",
    "platform_mapping_resolved",
    "platform_mapping_missing",
    "db_signal_label",
    "db_signal_component",
    "priority_escalation",
    "regression_candidate",
    "skipped_no_pr",
    "skipped_no_mapping",
    "skipped_no_signal",
    "skipped_provider_unavailable",
]


class TicketQualityFlags(BaseModel):
    missing_description: bool = False
    missing_acceptance_criteria: bool = False
    description_is_short: bool = False
    missing_dev_links: bool = False


class TicketComment(BaseModel):
    author: str
    created: str  # ISO timestamp, used only for ordering — not surfaced to model verbatim
    body: str


class LinkedIssue(BaseModel):
    key: str
    relation: str = ""
    summary: str = ""


class AttachmentMeta(BaseModel):
    name: str
    media_type: str = ""
    size_bytes: int = 0
    has_url: bool = False  # raw URL deliberately omitted; binary never embedded


class StatusTransition(BaseModel):
    from_status: str
    to_status: str
    at: str = ""


class TicketContext(BaseModel):
    key: str
    summary: str = ""
    description: str = ""
    issue_type: str = ""
    priority: str = ""
    labels: list[str] = Field(default_factory=list)
    components: list[str] = Field(default_factory=list)
    fix_versions: list[str] = Field(default_factory=list)
    comments: list[TicketComment] = Field(default_factory=list)
    linked_issues: list[LinkedIssue] = Field(default_factory=list)
    development_links: list[str] = Field(default_factory=list)
    attachments: list[AttachmentMeta] = Field(default_factory=list)
    status_history: list[StatusTransition] = Field(default_factory=list)
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    quality_flags: TicketQualityFlags = Field(default_factory=TicketQualityFlags)


class ChangedFile(BaseModel):
    path: str
    status: str = ""  # added | modified | removed | renamed
    additions: int = 0
    deletions: int = 0


class FileDiffChunk(BaseModel):
    path: str
    patch: str  # unified diff, single file
    truncated: bool = False


class ReviewComment(BaseModel):
    author: str
    body: str
    path: str = ""
    line: Optional[int] = None
    state: str = ""  # PR review state (approved/changes_requested/comment)


class CodeContext(BaseModel):
    platform: RepoPlatform = "none"
    pr_state: Optional[Literal["open", "merged", "closed"]] = None
    pr_title: str = ""
    pr_description: str = ""
    target_branch: str = ""
    commit_messages: list[str] = Field(default_factory=list)
    changed_files: list[ChangedFile] = Field(default_factory=list)
    file_diffs: list[FileDiffChunk] = Field(default_factory=list)
    review_comments: list[ReviewComment] = Field(default_factory=list)
    review_state: str = ""
    build_status: dict[str, Any] = Field(default_factory=dict)


class TableSchema(BaseModel):
    name: str
    columns: list[dict[str, Any]] = Field(default_factory=list)


class DbContext(BaseModel):
    tables: list[TableSchema] = Field(default_factory=list)
    foreign_keys: list[dict[str, Any]] = Field(default_factory=list)
    stored_procedures: list[dict[str, Any]] = Field(default_factory=list)
    indexes: list[dict[str, Any]] = Field(default_factory=list)
    constraints: list[dict[str, Any]] = Field(default_factory=list)
    views: list[dict[str, Any]] = Field(default_factory=list)
    recent_changes: list[dict[str, Any]] = Field(default_factory=list)


class ExistingTest(BaseModel):
    key: str = ""
    name: str
    last_status: str = ""


class ExistingTests(BaseModel):
    tests: list[ExistingTest] = Field(default_factory=list)


class ProviderError(BaseModel):
    provider: ProviderName
    code: str
    message: str = ""


class RoutingDecision(BaseModel):
    provider: ProviderName
    included: bool
    reasons: list[RoutingReasonCode] = Field(default_factory=list)


class ToolTrace(BaseModel):
    providers_called: list[ProviderName] = Field(default_factory=list)
    routing_decisions: list[RoutingDecision] = Field(default_factory=list)
    latency_ms: dict[str, int] = Field(default_factory=dict)
    errors: list[ProviderError] = Field(default_factory=list)


class BudgetStats(BaseModel):
    input_chars: int = 0
    per_section_chars: dict[str, int] = Field(default_factory=dict)
    hard_cap_chars: int = 0
    truncated_sections: list[str] = Field(default_factory=list)


class ContextBundle(BaseModel):
    """Single normalized model input. Prompt builder reads ONLY this."""

    model_config = ConfigDict(extra="forbid")

    ticket: TicketContext
    code_context: CodeContext = Field(default_factory=CodeContext)
    db_context: DbContext = Field(default_factory=DbContext)
    existing_tests: ExistingTests = Field(default_factory=ExistingTests)
    tool_trace: ToolTrace = Field(default_factory=ToolTrace)
    budget: BudgetStats = Field(default_factory=BudgetStats)
