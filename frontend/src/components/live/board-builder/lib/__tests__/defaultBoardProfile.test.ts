import { describe, expect, it } from "vitest";
import {
  defaultBoardProfile,
  defaultViewPrefs,
  DEFAULT_STATUS_OPTIONS,
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
    expect(p.selectedStatuses).toEqual([...DEFAULT_STATUS_OPTIONS]);
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

  it("auto qa map covers ready/testing/done with zero other on first render", () => {
    const p = defaultBoardProfile("FM");
    for (const s of p.qaStatusMap.ready) {
      expect(DEFAULT_STATUS_OPTIONS).toContain(s);
    }
    for (const s of p.qaStatusMap.testing) {
      expect(DEFAULT_STATUS_OPTIONS).toContain(s);
    }
    for (const s of p.qaStatusMap.done) {
      expect(DEFAULT_STATUS_OPTIONS).toContain(s);
    }
  });
});

describe("defaultViewPrefs", () => {
  it("ships QA mode, cozy density, no empty non-QA, no collapsed lanes", () => {
    const v = defaultViewPrefs();
    expect(v.boardColumnMode).toBe("qa");
    expect(v.density).toBe("cozy");
    expect(v.showEmptyNonQaColumns).toBe(false);
    expect(v.collapsedLaneKeys).toEqual([]);
  });
});
