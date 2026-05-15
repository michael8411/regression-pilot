/**
 * Phase 01 — Live board builder draft contracts.
 *
 * The board create dialog will gain a "simple" mode (no JQL required) plus
 * an "advanced" mode that exposes raw JQL editing. Both modes ultimately
 * produce the same `LiveBoardBuilderPayload`, which is API-compatible with
 * the existing `LiveBoard` create endpoint (name + jql + columns) and
 * additionally carries the durable `LiveBoardProfile` so the backend can
 * persist user setup choices.
 */

import type {
  LiveBoardAssigneeScope,
  LiveBoardColumnMode,
  LiveBoardDensity,
  LiveBoardLaneGrouping,
  LiveBoardProfile,
  LiveBoardQaStatusMap,
  LiveBoardViewPreferences,
} from "@/types/live";

export interface LiveBoardBuilderSimpleDraft {
  mode: "simple";
  name: string;
  projectKey: string;
  versionName: string;
  selectedStatuses: string[];
  qaStatusMap: LiveBoardQaStatusMap;
  laneGrouping: LiveBoardLaneGrouping;
  assigneeScope: LiveBoardAssigneeScope;
  refreshIntervalSec: number;
  /** Display columns for the kanban (defaults to selectedStatuses). */
  columns: string[];
}

export interface LiveBoardBuilderAdvancedDraft {
  mode: "advanced";
  name: string;
  /** Free-form JQL. */
  customJql: string;
  /** Required so analytics still bucket correctly. */
  qaStatusMap: LiveBoardQaStatusMap;
  laneGrouping: LiveBoardLaneGrouping;
  assigneeScope: LiveBoardAssigneeScope;
  refreshIntervalSec: number;
  /** Display columns derived from JQL or chosen explicitly. */
  columns: string[];
  /**
   * Best-effort project/version metadata so the profile carries some
   * routing hints even in advanced mode. May be empty strings.
   */
  projectKey: string;
  versionName: string;
}

export type LiveBoardBuilderDraft =
  | LiveBoardBuilderSimpleDraft
  | LiveBoardBuilderAdvancedDraft;

export interface LiveBoardBuilderPayload {
  /** Existing API contract — required by /live/boards create. */
  name: string;
  jql: string;
  columns: string[];
  /** Durable profile saved alongside the board (Phase 01). */
  profile: LiveBoardProfile;
}

export const DEFAULT_QA_STATUS_MAP: LiveBoardQaStatusMap = {
  ready: ["Ready to Test", "Ready for QA"],
  testing: ["In Testing", "Testing"],
  done: ["Done", "Closed", "Resolved"],
};

export const DEFAULT_REFRESH_INTERVAL_SEC = 60;

export const DEFAULT_BUILDER_VIEW_PREFS: LiveBoardViewPreferences = {
  homeFilter: "",
  boardColumnMode: "qa" satisfies LiveBoardColumnMode,
  density: "cozy" satisfies LiveBoardDensity,
  lastOpenedTicketKey: "",
};

export interface LiveBoardBuilderValidation {
  ok: boolean;
  errors: string[];
}
