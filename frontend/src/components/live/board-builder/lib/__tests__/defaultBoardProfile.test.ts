import { describe, expect, it } from "vitest";
import {
  defaultBoardProfile,
  defaultViewPrefs,
  smartDefaultSelectedStatuses,
  DEFAULT_REFRESH_INTERVAL_SEC,
} from "../defaultBoardProfile";

describe("defaultBoardProfile", () => {
  it("returns QA-leaning defaults for project + version", () => {
    const p = defaultBoardProfile("FM", "25.7");
    expect(p.builderMode).toBe("simple");
    expect(p.projectKey).toBe("FM");
    expect(p.versionName).toBe("25.7");
    expect(p.assigneeScope).toBe("anyone");
    expect(p.laneGrouping).toBe("none");
    expect(p.refreshIntervalSec).toBe(DEFAULT_REFRESH_INTERVAL_SEC);
  });

  it("seeds selectedStatuses + qaStatusMap as empty (filled from real workflow)", () => {
    const p = defaultBoardProfile("FM");
    expect(p.selectedStatuses).toEqual([]);
    expect(p.qaStatusMap).toEqual({ ready: [], testing: [], done: [] });
  });

  it("trims project + version", () => {
    const p = defaultBoardProfile("  FM  ", "  25.7 ");
    expect(p.projectKey).toBe("FM");
    expect(p.versionName).toBe("25.7");
  });

  it("returns a fresh array each call so mutation does not leak", () => {
    const a = defaultBoardProfile("FM");
    const b = defaultBoardProfile("FM");
    a.selectedStatuses.push("X");
    expect(b.selectedStatuses).not.toContain("X");
  });
});

describe("smartDefaultSelectedStatuses", () => {
  it("selects taxonomy-known QA statuses and done-category statuses", () => {
    const out = smartDefaultSelectedStatuses([
      { name: "Open", category: "new", issueTypes: [] },
      { name: "Ready for QA", category: "indeterminate", issueTypes: [] },
      { name: "In Testing", category: "indeterminate", issueTypes: [] },
      { name: "Done", category: "done", issueTypes: [] },
    ]);
    expect(out).toEqual(["Ready for QA", "In Testing", "Done"]);
  });

  it("expands to indeterminate + done when fewer than 2 are taxonomy-known", () => {
    const out = smartDefaultSelectedStatuses([
      { name: "Open", category: "new", issueTypes: [] },
      { name: "In Progress", category: "indeterminate", issueTypes: [] },
      { name: "Done", category: "done", issueTypes: [] },
    ]);
    // Only "Done" is taxonomy-known (category=done). One item < 2, so we
    // expand to every indeterminate/done status.
    expect(out).toContain("In Progress");
    expect(out).toContain("Done");
    expect(out).not.toContain("Open");
  });

  it("returns empty for empty input", () => {
    expect(smartDefaultSelectedStatuses([])).toEqual([]);
  });
});

describe("defaultViewPrefs", () => {
  it("ships full-workflow mode, cozy density, no empty non-QA, no collapsed lanes", () => {
    // Layer 1 PR2: new boards default to "all" mode so the user lands on
    // the full workflow grid rather than a 3-column QA slice.
    const v = defaultViewPrefs();
    expect(v.boardColumnMode).toBe("all");
    expect(v.density).toBe("cozy");
    expect(v.showEmptyNonQaColumns).toBe(false);
    expect(v.collapsedLaneKeys).toEqual([]);
  });
});
