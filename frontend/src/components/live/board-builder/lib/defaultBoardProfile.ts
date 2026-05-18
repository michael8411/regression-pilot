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
  return {
    builderMode: "simple",
    projectKey: projectKey.trim(),
    versionName: versionName.trim(),
    selectedStatuses: [...DEFAULT_STATUS_OPTIONS],
    qaStatusMap: {
      ready: [...DEFAULT_READY_STATUSES],
      testing: [...DEFAULT_TESTING_STATUSES],
      done: [...DEFAULT_DONE_STATUSES],
    },
    laneGrouping: "none",
    assigneeScope: "anyone",
    refreshIntervalSec: DEFAULT_REFRESH_INTERVAL_SEC,
    customJql: "",
  };
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
