import { classifyStatus } from "@/components/live/lib/statusTaxonomy";
import type { ProjectStatus } from "../hooks/useProjectStatuses";
import type {
  LiveBoardProfile,
  LiveBoardViewPreferences,
} from "@/types/live";

export const DEFAULT_READY_STATUSES = [
  "Ready for QA",
  "Ready to Test",
  "Ready for Test",
  "QA Ready",
];
export const DEFAULT_TESTING_STATUSES = [
  "In Testing",
  "Testing",
  "QA In Progress",
  "QA Testing",
];
export const DEFAULT_DONE_STATUSES = [
  "Done",
  "Closed",
  "Resolved",
  "Completed",
];

export const DEFAULT_STATUS_OPTIONS: ReadonlyArray<string> = [
  ...DEFAULT_READY_STATUSES,
  ...DEFAULT_TESTING_STATUSES,
  ...DEFAULT_DONE_STATUSES,
];

export const QA_COLUMN_READING_ORDER: ReadonlyArray<string> = [
  "Ready for QA",
  "Ready to Test",
  "In Testing",
  "Testing",
  "Done",
  "Closed",
  "Resolved",
];

export const DEFAULT_REFRESH_INTERVAL_SEC = 60;

// Internal builder-only sentinel: persisted as "epic" or "none" by the
// provider after the first fetch resolves it. The runtime profile type
// stays strict (none|epic|parent|component); we only widen at the UI layer.
export const AUTO_LANE_GROUPING = "auto" as const;
export type LaneGroupingOption =
  | LiveBoardProfile["laneGrouping"]
  | typeof AUTO_LANE_GROUPING;

export function defaultBoardProfile(
  projectKey: string,
  versionName: string = "",
): LiveBoardProfile {
  // selectedStatuses + qaStatusMap are seeded from the project's real
  // workflow once `useProjectStatuses` resolves; we never pre-fill them
  // from a hardcoded list (Phase 13 §0).
  //
  // Layer 1 — Workflow Columns:
  //   - boardTemplate defaults to "workflow" so new boards show the full
  //     workflow grid rather than a 3-status QA slice.
  //   - workflowColumnOrder is empty here; it's populated by the draft
  //     hook once `useProjectStatuses` resolves.
  return {
    builderMode: "simple",
    projectKey: projectKey.trim(),
    versionName: versionName.trim(),
    selectedStatuses: [],
    qaStatusMap: { ready: [], testing: [], done: [] },
    laneGrouping: "none",
    assigneeScope: "anyone",
    refreshIntervalSec: DEFAULT_REFRESH_INTERVAL_SEC,
    customJql: "",
    boardTemplate: "workflow",
    workflowColumnOrder: [],
    jiraBoardId: null,
  };
}

/**
 * Phase 13 §1.2 — derive the default selection from the project's real
 * statuses (not the static vocabulary).
 */
export function smartDefaultSelectedStatuses(
  statuses: ReadonlyArray<ProjectStatus>,
): string[] {
  if (statuses.length === 0) return [];
  const primary = statuses.filter((s) => {
    const bucket = classifyStatus(s.name);
    return (
      bucket === "ready" || bucket === "testing" || s.category === "done"
    );
  });
  if (primary.length >= 2) return primary.map((s) => s.name);
  const indeterminateOrDone = statuses.filter(
    (s) => s.category === "indeterminate" || s.category === "done",
  );
  return indeterminateOrDone.map((s) => s.name);
}

export function defaultViewPrefs(): LiveBoardViewPreferences {
  return {
    homeFilter: "",
    boardColumnMode: "qa",
    density: "cozy",
    lastOpenedTicketKey: "",
    showEmptyNonQaColumns: false,
    collapsedLaneKeys: [],
  };
}
