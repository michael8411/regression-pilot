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
  };
}

describe("resolveBoardColumns", () => {
  it("qa mode drops non-QA buckets", () => {
    const cols = resolveBoardColumns({
      jiraColumns: ["To Do", "In Progress", "Ready for QA", "Done"],
      byStatus: {
        "To Do": [tk("A-1", "To Do")],
        "In Progress": [tk("A-2", "In Progress")],
        "Ready for QA": [tk("A-3", "Ready for QA")],
        Done: [tk("A-4", "Done")],
      },
      mode: "qa",
      showEmptyNonQa: false,
    });
    expect(cols.map((c) => c.status)).toEqual(["Ready for QA", "Done"]);
  });

  it("all mode keeps QA columns leading in reading order, non-QA after", () => {
    const cols = resolveBoardColumns({
      jiraColumns: ["In Progress", "Done", "Ready for QA"],
      byStatus: {
        "In Progress": [tk("A-1", "In Progress")],
        Done: [tk("A-2", "Done")],
        "Ready for QA": [tk("A-3", "Ready for QA")],
      },
      mode: "all",
      showEmptyNonQa: false,
    });
    expect(cols.map((c) => c.status)).toEqual([
      "Ready for QA",
      "Done",
      "In Progress",
    ]);
  });

  it("hides empty non-QA columns unless showEmptyNonQa is true", () => {
    const args = {
      jiraColumns: ["In Progress", "Ready for QA"],
      byStatus: {
        "Ready for QA": [tk("A-1", "Ready for QA")],
        "In Progress": [] as JiraTicket[],
      },
      mode: "all" as const,
    };
    const hidden = resolveBoardColumns({ ...args, showEmptyNonQa: false });
    expect(hidden.map((c) => c.status)).toEqual(["Ready for QA"]);
    const shown = resolveBoardColumns({ ...args, showEmptyNonQa: true });
    expect(shown.map((c) => c.status)).toEqual(["Ready for QA", "In Progress"]);
  });

  it("marks the first non-empty column as leading", () => {
    const cols = resolveBoardColumns({
      jiraColumns: ["Ready for QA", "In Testing", "Done"],
      byStatus: {
        "Ready for QA": [],
        "In Testing": [tk("A-1", "In Testing")],
        Done: [tk("A-2", "Done")],
      },
      mode: "qa",
      showEmptyNonQa: false,
    });
    const leading = cols.filter((c) => c.isLeading);
    expect(leading).toHaveLength(1);
    expect(leading[0].status).toBe("In Testing");
  });

  it("drops ghost columns: saved-profile statuses absent from response", () => {
    const cols = resolveBoardColumns({
      // Saved profile lists Resolved + a real one. Response only has the real one.
      jiraColumns: ["Resolved", "Ready for QA"],
      byStatus: {
        "Ready for QA": [tk("A-1", "Ready for QA")],
      },
      mode: "qa",
      showEmptyNonQa: false,
    });
    expect(cols.map((c) => c.status)).toEqual(["Ready for QA"]);
  });

  it("keeps Done and Closed as sibling columns", () => {
    const cols = resolveBoardColumns({
      jiraColumns: ["Done", "Closed"],
      byStatus: {
        Done: [tk("A-1", "Done")],
        Closed: [tk("A-2", "Closed")],
      },
      mode: "qa",
      showEmptyNonQa: false,
    });
    expect(cols.map((c) => c.status).sort()).toEqual(["Closed", "Done"]);
  });
});
