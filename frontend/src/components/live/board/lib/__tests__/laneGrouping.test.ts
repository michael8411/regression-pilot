import { describe, expect, it } from "vitest";
import { groupTicketsByLane, resolveAutoLaneGrouping } from "../laneGrouping";
import type { JiraTicket } from "@/types";

function tk(opts: Partial<JiraTicket> & { key: string }): JiraTicket {
  return {
    key: opts.key,
    id: opts.key,
    summary: opts.key,
    status: opts.status ?? "In Progress",
    issue_type: opts.issue_type ?? "Bug",
    priority: opts.priority ?? "Medium",
    assignee: "",
    reporter: "",
    labels: [],
    components: opts.components ?? [],
    fix_versions: [],
    resolution: "",
    created: "",
    updated: "",
    description: "",
    comments: [],
    epic_key: opts.epic_key,
    parent_key: opts.parent_key,
    component_name: opts.component_name,
  };
}

describe("groupTicketsByLane", () => {
  it('mode "none" returns a single all-lane', () => {
    const lanes = groupTicketsByLane(
      [tk({ key: "A-1" }), tk({ key: "A-2" })],
      "none",
    );
    expect(lanes).toHaveLength(1);
    expect(lanes[0].tickets).toHaveLength(2);
  });

  it("groups by epic and puts fallback last regardless of count", () => {
    const tickets = [
      tk({ key: "A-1", epic_key: "FM-100" }),
      tk({ key: "A-2", epic_key: "FM-100" }),
      tk({ key: "A-3", epic_key: "FM-200" }),
      tk({ key: "A-4" }),
      tk({ key: "A-5" }),
      tk({ key: "A-6" }),
    ];
    const lanes = groupTicketsByLane(tickets, "epic");
    expect(lanes.map((l) => l.laneLabel)).toEqual([
      "FM-100",
      "FM-200",
      "No epic",
    ]);
  });

  it("falls back to parent_key when epic_key is absent", () => {
    const lanes = groupTicketsByLane(
      [tk({ key: "A-1", parent_key: "FM-50" })],
      "epic",
    );
    expect(lanes[0].laneLabel).toBe("FM-50");
  });

  it("component mode uses component_name first, then components[0]", () => {
    const lanes = groupTicketsByLane(
      [
        tk({ key: "A-1", component_name: "Mobile" }),
        tk({ key: "A-2", components: ["Telematics"] }),
        tk({ key: "A-3" }),
      ],
      "component",
    );
    const labels = lanes.map((l) => l.laneLabel);
    expect(labels).toContain("Mobile");
    expect(labels).toContain("Telematics");
    expect(labels[labels.length - 1]).toBe("No component");
  });

  it("returns empty array when no tickets and mode is not none", () => {
    expect(groupTicketsByLane([], "epic")).toEqual([]);
  });
});

describe("resolveAutoLaneGrouping", () => {
  it("returns none for tiny boards", () => {
    const tickets = Array.from({ length: 5 }, (_, i) =>
      tk({ key: `A-${i}`, epic_key: i % 2 === 0 ? "E-1" : "E-2" }),
    );
    expect(resolveAutoLaneGrouping(tickets)).toBe("none");
  });

  it("returns none for many tickets sharing one epic", () => {
    const tickets = Array.from({ length: 25 }, (_, i) =>
      tk({ key: `A-${i}`, epic_key: "E-1" }),
    );
    expect(resolveAutoLaneGrouping(tickets)).toBe("none");
  });

  it("returns epic for broad multi-epic boards", () => {
    const tickets = Array.from({ length: 25 }, (_, i) =>
      tk({ key: `A-${i}`, epic_key: i < 10 ? "E-1" : i < 18 ? "E-2" : "E-3" }),
    );
    expect(resolveAutoLaneGrouping(tickets)).toBe("epic");
  });
});
