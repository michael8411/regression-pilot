import { describe, expect, it } from "vitest";
import { resolveBoardColumns } from "../columnVisibility";
import type { JiraTicket } from "@/types";

function tk(key: string, status: string): JiraTicket {
  return {
    key,
    id: key,
    summary: key,
    status,
    issue_type: "Bug",
    priority: "Medium",
    assignee: "",
    reporter: "",
    labels: [],
    components: [],
    fix_versions: [],
    resolution: "",
    created: "",
    updated: "",
    description: "",
    comments: [],
    development_links: [],
    pull_requests: [],
  };
}

describe("resolveBoardColumns (Layer 1 PR2)", () => {
  describe("columnOrder drives output (not byStatus keys)", () => {
    it("renders every workflow column in order, even when some are empty (showEmpty=true)", () => {
      const cols = resolveBoardColumns({
        columnOrder: [
          "To Do",
          "In Development",
          "In Review",
          "Ready to Test",
          "In Testing",
          "Closed",
        ],
        byStatus: {
          "Ready to Test": [tk("FM-1", "Ready to Test")],
          "In Testing": [tk("FM-2", "In Testing")],
        },
        mode: "all",
        showEmpty: true,
      });
      // All 6 workflow columns appear in the saved L→R order — empty ones
      // render as slim placeholders rather than disappearing.
      expect(cols.map((c) => c.status)).toEqual([
        "To Do",
        "In Development",
        "In Review",
        "Ready to Test",
        "In Testing",
        "Closed",
      ]);
      // Counts reflect byStatus accurately.
      expect(cols.find((c) => c.status === "Ready to Test")?.count).toBe(1);
      expect(cols.find((c) => c.status === "To Do")?.count).toBe(0);
    });

    it("ghost columns: status in columnOrder absent from byStatus still renders (slim)", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["Ready to Test", "Resolved"],
        byStatus: {
          "Ready to Test": [tk("FM-1", "Ready to Test")],
        },
        mode: "all",
        showEmpty: true,
      });
      // The previous implementation dropped "Resolved" because it was
      // absent from byStatus. PR2 keeps it as an empty placeholder.
      expect(cols.map((c) => c.status)).toEqual(["Ready to Test", "Resolved"]);
      expect(cols.find((c) => c.status === "Resolved")?.count).toBe(0);
    });

    it("dedupes columnOrder case-insensitively, keeping first occurrence", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["Done", "done", "DONE"],
        byStatus: { Done: [tk("FM-1", "Done")] },
        mode: "all",
        showEmpty: true,
      });
      expect(cols.map((c) => c.status)).toEqual(["Done"]);
    });
  });

  describe("orphan handling (status in byStatus, not in columnOrder)", () => {
    it("appends orphans at end in 'all' mode so tickets are never hidden", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["To Do", "Done"],
        byStatus: {
          "To Do": [tk("FM-1", "To Do")],
          Done: [tk("FM-2", "Done")],
          // 'Blocked' is not in columnOrder — must still surface in 'all'.
          Blocked: [tk("FM-3", "Blocked")],
        },
        mode: "all",
        showEmpty: false,
      });
      expect(cols.map((c) => c.status)).toEqual(["To Do", "Done", "Blocked"]);
    });

    it("omits non-QA orphans in 'qa' mode", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["Ready to Test", "Done"],
        byStatus: {
          "Ready to Test": [tk("FM-1", "Ready to Test")],
          Done: [tk("FM-2", "Done")],
          Blocked: [tk("FM-3", "Blocked")],
        },
        mode: "qa",
        showEmpty: false,
      });
      expect(cols.map((c) => c.status)).toEqual(["Ready to Test", "Done"]);
    });
  });

  describe("mode + showEmpty filter", () => {
    it("'qa' mode drops non-QA buckets", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["To Do", "In Progress", "Ready for QA", "Done"],
        byStatus: {
          "To Do": [tk("A-1", "To Do")],
          "In Progress": [tk("A-2", "In Progress")],
          "Ready for QA": [tk("A-3", "Ready for QA")],
          Done: [tk("A-4", "Done")],
        },
        mode: "qa",
        showEmpty: false,
      });
      expect(cols.map((c) => c.status)).toEqual(["Ready for QA", "Done"]);
    });

    it("'qa' mode keeps empty QA columns as slim placeholders regardless of showEmpty", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["Ready for QA", "In Testing", "Done"],
        byStatus: { Done: [tk("A-1", "Done")] },
        mode: "qa",
        showEmpty: false,
      });
      // Empty QA columns survive — the QA grid stays stable.
      expect(cols.map((c) => c.status)).toEqual([
        "Ready for QA",
        "In Testing",
        "Done",
      ]);
    });

    it("'all' mode hides empty non-QA columns when showEmpty is false", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["To Do", "In Progress", "Ready for QA"],
        byStatus: { "Ready for QA": [tk("A-1", "Ready for QA")] },
        mode: "all",
        showEmpty: false,
      });
      // To Do and In Progress are empty non-QA — hidden when showEmpty=false.
      expect(cols.map((c) => c.status)).toEqual(["Ready for QA"]);
    });

    it("'all' mode shows everything when showEmpty is true", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["To Do", "In Progress", "Ready for QA"],
        byStatus: { "Ready for QA": [tk("A-1", "Ready for QA")] },
        mode: "all",
        showEmpty: true,
      });
      expect(cols.map((c) => c.status)).toEqual([
        "To Do",
        "In Progress",
        "Ready for QA",
      ]);
    });
  });

  describe("leading column", () => {
    it("marks the first non-empty column as leading", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["Ready for QA", "In Testing", "Done"],
        byStatus: {
          "In Testing": [tk("A-1", "In Testing")],
          Done: [tk("A-2", "Done")],
        },
        mode: "qa",
        showEmpty: false,
      });
      const leading = cols.filter((c) => c.isLeading);
      expect(leading).toHaveLength(1);
      expect(leading[0].status).toBe("In Testing");
    });

    it("no column is leading when every column is empty", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["Ready for QA", "Done"],
        byStatus: {},
        mode: "qa",
        showEmpty: false,
      });
      expect(cols.every((c) => !c.isLeading)).toBe(true);
    });
  });

  describe("Done + Closed siblings", () => {
    it("keeps Done and Closed as separate columns when both are in columnOrder", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["Done", "Closed"],
        byStatus: {
          Done: [tk("A-1", "Done")],
          Closed: [tk("A-2", "Closed")],
        },
        mode: "qa",
        showEmpty: false,
      });
      expect(cols.map((c) => c.status)).toEqual(["Done", "Closed"]);
    });
  });

  describe("qaStatusOverride", () => {
    it("classifies via the override map when provided", () => {
      const cols = resolveBoardColumns({
        columnOrder: ["My Custom Ready", "In Progress"],
        byStatus: {
          "My Custom Ready": [tk("A-1", "My Custom Ready")],
          "In Progress": [tk("A-2", "In Progress")],
        },
        mode: "qa",
        showEmpty: false,
        qaStatusOverride: {
          ready: ["My Custom Ready"],
          testing: [],
          done: [],
        },
      });
      // "My Custom Ready" is classified as 'ready' via the override, so it
      // survives QA mode. "In Progress" classifies as 'other' and drops.
      expect(cols.map((c) => c.status)).toEqual(["My Custom Ready"]);
    });
  });
});
