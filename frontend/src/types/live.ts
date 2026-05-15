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

export interface LiveBoardThroughput {
  /** Always 7 slots — oldest to newest day, inclusive of today. */
  points: LiveBoardThroughputPoint[];
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

export interface LiveBoardViewPreferences {
  /** Filter selection on Live home (free-form text/preset). */
  homeFilter: string;
  /** Whether the board view shows every column or only QA-relevant ones. */
  boardColumnMode: LiveBoardColumnMode;
  density: LiveBoardDensity;
  /** Restore the last-opened ticket drawer if it still applies. */
  lastOpenedTicketKey: string;
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
  | "failed";

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
