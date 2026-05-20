import { describe, expect, it } from "vitest";
import { shouldOpenAdvanced } from "../shouldOpenAdvanced";
import type { LiveBoard, LiveBoardProfile } from "@/types/live";

function boardOf(
  overrides: Partial<LiveBoardProfile> = {},
  base: Partial<LiveBoard> = {},
): LiveBoard {
  return {
    id: "b1",
    name: "B",
    jql: "project = FM",
    columns: [],
    pinned: false,
    created_at: "",
    updated_at: "",
    profile: {
      builderMode: "simple",
      projectKey: "FM",
      versionName: "",
      selectedStatuses: [],
      qaStatusMap: { ready: [], testing: [], done: [] },
      laneGrouping: "none",
      assigneeScope: "anyone",
      refreshIntervalSec: 60,
      customJql: "",
      ...overrides,
    },
    view_prefs: null,
    ...base,
  };
}

describe("shouldOpenAdvanced", () => {
  it("returns false for new board (no initial)", () => {
    expect(shouldOpenAdvanced(null)).toBe(false);
    expect(shouldOpenAdvanced(undefined)).toBe(false);
  });

  it("returns false for default simple-mode board", () => {
    expect(shouldOpenAdvanced(boardOf())).toBe(false);
  });

  it("returns true for advanced/custom JQL boards", () => {
    expect(shouldOpenAdvanced(boardOf({ builderMode: "advanced" }))).toBe(true);
  });

  it("returns true for non-none lane grouping", () => {
    expect(shouldOpenAdvanced(boardOf({ laneGrouping: "epic" }))).toBe(true);
  });

  it("returns true when a selected status is not in any bucket (manual exclude)", () => {
    expect(
      shouldOpenAdvanced(
        boardOf({
          selectedStatuses: ["Ready for QA", "Triage"],
          qaStatusMap: {
            ready: ["Ready for QA"],
            testing: [],
            done: [],
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns false when buckets cover every selected status", () => {
    expect(
      shouldOpenAdvanced(
        boardOf({
          selectedStatuses: ["Ready for QA", "Done"],
          qaStatusMap: {
            ready: ["Ready for QA"],
            testing: [],
            done: ["Done"],
          },
        }),
      ),
    ).toBe(false);
  });
});
