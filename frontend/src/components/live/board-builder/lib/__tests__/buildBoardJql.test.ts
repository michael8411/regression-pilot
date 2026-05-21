import { describe, expect, it } from "vitest";
import { buildBoardJql } from "../buildBoardJql";

describe("buildBoardJql", () => {
  describe("workflow template (default)", () => {
    it("with version: no status filter, just project + fixVersion", () => {
      const jql = buildBoardJql({
        template: "workflow",
        projectKey: "FM",
        versionName: "3.2.0",
      });
      expect(jql).toBe(
        'project = "FM" AND fixVersion = "3.2.0" ORDER BY updated DESC',
      );
    });

    it("without version: bounds to active + done family (no status slice)", () => {
      const jql = buildBoardJql({
        template: "workflow",
        projectKey: "FM",
      });
      expect(jql).toContain('project = "FM"');
      expect(jql).toContain('statusCategory != "Done"');
      // crucial: NO `status in (3 QA names)` filter
      expect(jql).not.toMatch(/status in\b.*Ready to Test/);
    });

    it("includes components when provided", () => {
      const jql = buildBoardJql({
        template: "workflow",
        projectKey: "FM",
        versionName: "3.2.0",
        components: ["payroll", "gps"],
      });
      expect(jql).toContain('component in ("payroll", "gps")');
    });

    it("includes assignee = currentUser when scope is currentUser", () => {
      const jql = buildBoardJql({
        template: "workflow",
        projectKey: "FM",
        versionName: "3.2.0",
        assigneeScope: "currentUser",
      });
      expect(jql).toContain("assignee = currentUser()");
    });

    it("omits assignee clause for 'anyone' scope", () => {
      const jql = buildBoardJql({
        template: "workflow",
        projectKey: "FM",
        versionName: "3.2.0",
        assigneeScope: "anyone",
      });
      expect(jql).not.toContain("assignee");
    });

    it("ignores qaStatusMap entirely (status filter not applied)", () => {
      const jql = buildBoardJql({
        template: "workflow",
        projectKey: "FM",
        versionName: "3.2.0",
        qaStatusMap: {
          ready: ["Ready to Test"],
          testing: ["In Testing"],
          done: ["Closed"],
        },
      });
      // Workflow template never adds `status in` — that's its whole point.
      expect(jql).not.toContain("status in");
    });
  });

  describe("qa_release template", () => {
    it("adds status filter from qaStatusMap (ready+testing+done flattened)", () => {
      const jql = buildBoardJql({
        template: "qa_release",
        projectKey: "FM",
        versionName: "3.2.0",
        qaStatusMap: {
          ready: ["Ready to Test"],
          testing: ["In Testing"],
          done: ["Closed"],
        },
      });
      expect(jql).toContain(
        'status in ("Ready to Test", "In Testing", "Closed")',
      );
    });

    it("falls back to qaStatusFallback list when qaStatusMap is empty", () => {
      const jql = buildBoardJql({
        template: "qa_release",
        projectKey: "FM",
        versionName: "3.2.0",
        qaStatusMap: { ready: [], testing: [], done: [] },
        qaStatusFallback: ["Ready to Test", "In Testing", "Closed"],
      });
      expect(jql).toContain(
        'status in ("Ready to Test", "In Testing", "Closed")',
      );
    });

    it("omits status filter entirely when nothing to filter on", () => {
      const jql = buildBoardJql({
        template: "qa_release",
        projectKey: "FM",
      });
      expect(jql).not.toContain("status in");
      expect(jql).not.toContain("statusCategory");
    });

    it("composes project + version + components + assignee + status", () => {
      const jql = buildBoardJql({
        template: "qa_release",
        projectKey: "FM",
        versionName: "3.2.0",
        components: ["payroll"],
        assigneeScope: "currentUser",
        qaStatusMap: {
          ready: ["Ready to Test"],
          testing: [],
          done: ["Closed"],
        },
      });
      expect(jql).toBe(
        'project = "FM" AND fixVersion = "3.2.0" AND component in ("payroll") AND assignee = currentUser() AND status in ("Ready to Test", "Closed") ORDER BY updated DESC',
      );
    });
  });

  describe("string escaping", () => {
    it("escapes double quotes in names", () => {
      const jql = buildBoardJql({
        template: "workflow",
        projectKey: 'FM"INJECT',
        versionName: "3.2.0",
      });
      // Double-quote inside the project key is backslash-escaped.
      expect(jql).toContain('project = "FM\\"INJECT"');
    });
  });
});
