import { describe, expect, it } from "vitest";
import { applyAutoQaMap } from "../applyAutoQaMap";

const EMPTY = { ready: [], testing: [], done: [] };

describe("applyAutoQaMap", () => {
  it("resolves taxonomy-known statuses deterministically", () => {
    const out = applyAutoQaMap({
      statuses: ["Ready for QA", "In Testing", "Done"],
      current: EMPTY,
    });
    expect(out.next.ready).toEqual(["Ready for QA"]);
    expect(out.next.testing).toEqual(["In Testing"]);
    expect(out.next.done).toEqual(["Done"]);
    expect(out.unresolved).toEqual([]);
    expect(out.changedCount).toBe(3);
  });

  it("preserves user choices and only fills gaps", () => {
    const out = applyAutoQaMap({
      statuses: ["Ready for QA", "In Testing", "Done", "Code Review"],
      current: {
        ready: [],
        // user manually moved "Code Review" into testing
        testing: ["Code Review"],
        done: [],
      },
    });
    expect(out.next.testing).toContain("Code Review");
    expect(out.next.ready).toEqual(["Ready for QA"]);
    expect(out.next.done).toEqual(["Done"]);
  });

  it("returns unresolved for unknown new-category statuses", () => {
    const out = applyAutoQaMap({
      statuses: ["Triage", "Done"],
      current: EMPTY,
      projectCategoryByStatus: { Triage: "new", Done: "done" },
    });
    expect(out.unresolved).toEqual(["Triage"]);
    expect(out.next.done).toEqual(["Done"]);
  });

  it("uses Jira done category to bucket unknown statuses", () => {
    const out = applyAutoQaMap({
      statuses: ["Archived"],
      current: EMPTY,
      projectCategoryByStatus: { Archived: "done" },
    });
    expect(out.next.done).toEqual(["Archived"]);
    expect(out.unresolved).toEqual([]);
  });

  it("is idempotent on repeat calls", () => {
    const first = applyAutoQaMap({
      statuses: ["Ready for QA", "In Testing", "Done"],
      current: EMPTY,
    });
    const second = applyAutoQaMap({
      statuses: ["Ready for QA", "In Testing", "Done"],
      current: first.next,
    });
    expect(second.next).toEqual(first.next);
    expect(second.changedCount).toBe(0);
  });

  it("drops mappings for statuses no longer in the selection", () => {
    const out = applyAutoQaMap({
      statuses: ["Ready for QA"],
      current: { ready: ["Ready for QA"], testing: ["In Testing"], done: ["Done"] },
    });
    expect(out.next).toEqual({
      ready: ["Ready for QA"],
      testing: [],
      done: [],
    });
  });
});
