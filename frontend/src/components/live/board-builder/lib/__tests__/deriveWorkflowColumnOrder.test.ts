import { describe, expect, it } from "vitest";
import { deriveWorkflowColumnOrder } from "../deriveWorkflowColumnOrder";
import type { ProjectStatus } from "../../hooks/useProjectStatuses";

function st(
  name: string,
  category: ProjectStatus["category"] = "indeterminate",
): ProjectStatus {
  return { name, category, issueTypes: [] };
}

describe("deriveWorkflowColumnOrder", () => {
  describe("with server-supplied order", () => {
    it("trusts the server order when present", () => {
      const order = deriveWorkflowColumnOrder(
        [st("Done", "done"), st("To Do", "new"), st("In Dev")],
        ["To Do", "In Dev", "Done"],
      );
      expect(order).toEqual(["To Do", "In Dev", "Done"]);
    });

    it("dedupes case-insensitively while keeping first occurrence", () => {
      const order = deriveWorkflowColumnOrder([], [
        "To Do",
        "TO DO",
        "In Dev",
        "in dev",
        "Done",
      ]);
      expect(order).toEqual(["To Do", "In Dev", "Done"]);
    });

    it("treats empty server order as missing and falls back to heuristic", () => {
      const order = deriveWorkflowColumnOrder(
        [st("Done", "done"), st("To Do", "new")],
        [],
      );
      expect(order).toEqual(["To Do", "Done"]);
    });
  });

  describe("heuristic ordering (no server order)", () => {
    it("buckets new → indeterminate → done", () => {
      const order = deriveWorkflowColumnOrder([
        st("Done", "done"),
        st("In Testing", "indeterminate"),
        st("To Do", "new"),
      ]);
      expect(order).toEqual(["To Do", "In Testing", "Done"]);
    });

    it("orders indeterminate by canonical slot priority", () => {
      const order = deriveWorkflowColumnOrder([
        st("In Testing"),
        st("In Review"),
        st("In Development"),
        st("Ready to Test"),
        st("Ready for Review"),
      ]);
      expect(order).toEqual([
        "In Development",
        "Ready for Review",
        "In Review",
        "Ready to Test",
        "In Testing",
      ]);
    });

    it("matches case-insensitively (FM workflow uses uppercase)", () => {
      const order = deriveWorkflowColumnOrder([
        st("CLOSED", "done"),
        st("READY TO TEST"),
        st("IN TESTING"),
        st("IN REVIEW"),
        st("IN DEVELOPMENT"),
        st("CODE REVIEW"),
        st("TO DO", "new"),
      ]);
      // CODE REVIEW matches "review" slot before "code review" word — both
      // map to IN_REVIEW slot. Both should appear; first-seen wins on tie.
      expect(order[0]).toBe("TO DO");
      expect(order[order.length - 1]).toBe("CLOSED");
      // Workflow-relative ordering within indeterminate:
      const devIdx = order.indexOf("IN DEVELOPMENT");
      const reviewIdx = order.indexOf("IN REVIEW");
      const readyIdx = order.indexOf("READY TO TEST");
      const testIdx = order.indexOf("IN TESTING");
      expect(devIdx).toBeLessThan(reviewIdx);
      expect(reviewIdx).toBeLessThan(readyIdx);
      expect(readyIdx).toBeLessThan(testIdx);
    });

    it("trails unmatched names alphabetically after matched ones", () => {
      const order = deriveWorkflowColumnOrder([
        st("Blocked"),
        st("Regression"),
        st("In Development"),
      ]);
      expect(order[0]).toBe("In Development");
      // Blocked and Regression are unmatched indeterminate → trailing alpha
      expect(order.slice(1)).toEqual(["Blocked", "Regression"]);
    });

    it("dedupes case-insensitively (whichever sort order wins, only one survives)", () => {
      const order = deriveWorkflowColumnOrder([
        st("Done", "done"),
        st("done", "done"),
        st("DONE", "done"),
      ]);
      expect(order).toHaveLength(1);
      expect(order[0].toLowerCase()).toBe("done");
    });
  });
});
