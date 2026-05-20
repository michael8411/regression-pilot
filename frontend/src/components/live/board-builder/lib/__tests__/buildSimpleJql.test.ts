import { describe, expect, it } from "vitest";
import { buildSimpleJql } from "../buildSimpleJql";

describe("buildSimpleJql", () => {
  it("emits project + active-work clause by default", () => {
    const jql = buildSimpleJql({ projectKey: "FM" });
    expect(jql).toBe(
      'project = "FM" AND (statusCategory != "Done" OR status in ("Done", "Closed", "Resolved", "Completed")) ORDER BY updated DESC',
    );
  });

  it("adds fixVersion clause when version provided", () => {
    const jql = buildSimpleJql({ projectKey: "FM", versionName: "25.7" });
    expect(jql).toContain('fixVersion = "25.7"');
  });

  it("AND-joins components", () => {
    const jql = buildSimpleJql({
      projectKey: "FM",
      components: ["Mobile", "Telematics"],
    });
    expect(jql).toContain('component in ("Mobile", "Telematics")');
  });

  it("uses status in (...) when selectedStatuses is non-empty", () => {
    const jql = buildSimpleJql({
      projectKey: "FM",
      selectedStatuses: ["Ready for QA", "In Testing"],
    });
    expect(jql).toContain('status in ("Ready for QA", "In Testing")');
    expect(jql).not.toContain("statusCategory");
  });

  it("respects assignee scope", () => {
    const jql = buildSimpleJql({
      projectKey: "FM",
      assigneeScope: "currentUser",
    });
    expect(jql).toContain("assignee = currentUser()");
  });

  it("escapes embedded quotes defensively", () => {
    const jql = buildSimpleJql({
      projectKey: 'F"M',
      versionName: '25"7',
    });
    expect(jql).toContain('project = "F\\"M"');
    expect(jql).toContain('fixVersion = "25\\"7"');
  });

  it("never produces double AND or trailing whitespace", () => {
    const jql = buildSimpleJql({ projectKey: "FM", versionName: "" });
    expect(jql).not.toMatch(/AND\s+AND/);
    expect(jql).toBe(jql.trim());
  });
});
