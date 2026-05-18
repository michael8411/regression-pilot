import type { JiraTicket } from "@/types";

// =============================================================================
// Live boards — API payload shape
// =============================================================================

export interface LiveBoard {
  id: string;
  name: string;
  jql: string;
  columns: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
  /** Phase 01: durable board profile. May be null on legacy rows. */
  profile?: LiveBoardProfile | null;
  /** Phase 01: per-user board view preferences. May be null. */
  view_prefs?: LiveBoardViewPreferences | null;
}

export interface BoardResponse {
  total: number;
  by_status: Record<string, JiraTicket[]>;
  fetched_at: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string };
}

export interface JiraCommentMeta {
  id: string;
  author: string;
  created: string;
}

export interface JiraCommentSubmitResponse {
  comment: JiraCommentMeta;
  secret_scan_warnings: { pattern_name: string }[];
}

export interface JiraTransitionResult {
  ok: boolean;
  skipped: boolean;
}

// =============================================================================
// Live board analytics — Phase 01 contracts
// =============================================================================

export interface LiveBoardFunnel {
  ready: number;
  testing: number;
  done: number;
}

export interface LiveBoardThroughputPoint {
  /** ISO date (YYYY-MM-DD) for the bucket. */
  day: string;
  done: number;
}

export interface LiveBoardInsights {
  funnel: LiveBoardFunnel;
  /** ready + testing — "currently moving through QA". */
  inFlight: number;
  /** ready + testing + done. */
  total: number;
  /** 7-day done trend. */
  throughput7d: LiveBoardThroughputPoint[];
  /**
   * Percentage of in-flight tickets that have aged past a configured
   * staleness threshold. Phase 01: derived heuristically from updated_at.
   */
  agingRiskPct: number;
  /** ISO timestamp the insights were computed. */
  computedAt: string;
}

// =============================================================================
// Live board persistence contracts — Phase 01
// =============================================================================

export type LiveBoardBuilderMode = "simple" | "advanced";
export type LiveBoardLaneGrouping =
  | "none"
  | "epic"
  | "parent"
  | "component";
export type LiveBoardAssigneeScope = "anyone" | "currentUser";

export interface LiveBoardQaStatusMap {
  ready: string[];
  testing: string[];
  done: string[];
}

export interface LiveBoardProfile {
  builderMode: LiveBoardBuilderMode;
  projectKey: string;
  versionName: string;
  selectedStatuses: string[];
  qaStatusMap: LiveBoardQaStatusMap;
  laneGrouping: LiveBoardLaneGrouping;
  assigneeScope: LiveBoardAssigneeScope;
  refreshIntervalSec: number;
  /** Mirror of the customer-edited raw JQL (advanced mode). */
  customJql: string;
}

export type LiveBoardColumnMode = "all" | "qa";
export type LiveBoardDensity = "compact" | "cozy" | "roomy";
export type LiveBoardBuilderUiMode = "quick" | "advanced";

export interface LiveBoardViewPreferences {
  /** Filter selection on Live home (free-form text/preset). */
  homeFilter: string;
  /** Whether the board view shows every column or only QA-relevant ones. */
  boardColumnMode: LiveBoardColumnMode;
  density: LiveBoardDensity;
  /** Restore the last-opened ticket drawer if it still applies. */
  lastOpenedTicketKey: string;
  /** Phase 13 — show empty non-QA columns when in `all` mode. */
  showEmptyNonQaColumns?: boolean;
  /** Phase 13 — collapsed swimlanes by lane key. */
  collapsedLaneKeys?: string[];
}

// =============================================================================
// Live workflow artifacts — Phase 01 persistence contracts
// =============================================================================

export interface LivePinnedTicket {
  ticket_key: string;
  board_id: string | null;
  ticket_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type LiveGeneratedCasesStatus =
  | "draft"
  | "exporting"
  | "exported"
  | "failed"
  // Phase 06b — publish-to-Jira status states.
  | "accepted"
  | "partial_export"
  | "commented"
  | "discarded";

// =============================================================================
// Live publish-to-Jira contracts (Phase 06b)
// =============================================================================

/**
 * Phase 06c — Live publishes default to the Jira ticket's `Test Cases`
 * custom field. Comment publishing is the optional fallback. The legacy
 * `linked_test_cases` mode stays in the union so historical drafts keep
 * deserializing without crashes; it is no longer surfaced in the UI.
 */
export type LivePublishMode =
  | "jira_test_cases_field"
  | "jira_comment"
  | "linked_test_cases";

export type LivePublishTarget =
  | "jira_test_cases_field"
  | "jira_comment"
  | "zephyr_linked_tests"
  | "none";

export interface LivePublishCasesRequest {
  ticket_key: string;
  project_key: string;
  /** When undefined or empty, publish all cases in the set. */
  case_indexes?: number[] | null;
  /** Live default = `jira_test_cases_field`. */
  mode: LivePublishMode;
  /** When the primary field write fails, fall back to a Jira comment. */
  fallback_to_comment: boolean;
  folder_id?: number | null;
  /** Required for re-publish after status is exported/partial_export/commented. */
  confirm_duplicate?: boolean;
  /**
   * Phase 06c — preformatted Jira-friendly body. The dialog renders the
   * preview via `lib/jiraCommentFormatter.ts` and sends that exact string
   * here so the preview and the posted text are identical byte-for-byte.
   * Used for both the field-write target and the comment target.
   */
  body?: string | null;
  /** Override the target Jira custom field id when posting to the field. */
  test_cases_field_id?: string;
}

/**
 * Phase 06c — surgical per-case update payload used by the case editor so
 * saving one case never overwrites its siblings.
 */
export interface LiveCaseUpdateEntry {
  index: number;
  case: Record<string, unknown>;
}

export interface LiveCreatedTestCase {
  name: string;
  key?: string | null;
  id?: string | null;
  self_url?: string | null;
}

export interface LiveFailedPublishCase {
  name: string;
  error: string;
}

export interface LiveJiraCommentResult {
  id: string;
  ticket_key: string;
  author?: string | null;
  created?: string | null;
  url?: string | null;
}

export interface LiveJiraFieldResult {
  field_id: string;
  ticket_key: string;
  updated_at?: string | null;
}

export interface LivePublishCasesResponse {
  status: LiveGeneratedCasesStatus;
  target: LivePublishTarget;
  created: number;
  created_test_cases: LiveCreatedTestCase[];
  failed: LiveFailedPublishCase[];
  jira_comment: LiveJiraCommentResult | null;
  jira_field?: LiveJiraFieldResult | null;
  appears_on_jira_ticket: boolean;
  duplicate_attempt: boolean;
  message?: string | null;
  exported_at?: string | null;
}

export interface LiveExportMetadata {
  target: LivePublishTarget;
  source_ticket_key: string;
  project_key: string;
  selected_case_indexes: number[];
  created_test_cases: LiveCreatedTestCase[];
  failed: LiveFailedPublishCase[];
  jira_comment: LiveJiraCommentResult | null;
  jira_field?: LiveJiraFieldResult | null;
  appears_on_jira_ticket: boolean;
  published_at: string;
  duplicate_attempt: boolean;
}

export interface LiveGeneratedCases {
  id: string;
  ticket_key: string;
  board_id: string | null;
  instructions: string;
  cases: unknown[];
  context_metadata: Record<string, unknown> | null;
  export_metadata: Record<string, unknown> | null;
  status: LiveGeneratedCasesStatus;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LiveActivityKind =
  | "board_created"
  | "board_updated"
  | "ticket_pinned"
  | "ticket_unpinned"
  | "cases_generated"
  | "cases_exported"
  | "comment_posted"
  | "transition_applied"
  | "other";

export interface LiveActivityEvent {
  id: string;
  board_id: string | null;
  ticket_key: string | null;
  kind: LiveActivityKind;
  summary: string;
  detail: string;
  created_at: string;
}
