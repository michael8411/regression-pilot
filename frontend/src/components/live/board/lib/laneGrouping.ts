import type { JiraTicket } from "@/types";
import type { LiveBoardLaneGrouping } from "@/types/live";

export interface Lane {
  laneKey: string;
  laneLabel: string;
  tickets: JiraTicket[];
  /** True for the synthetic fallback lane (No epic / Standalone / No component). */
  isFallback: boolean;
}

const FALLBACK_LABEL: Record<LiveBoardLaneGrouping, string> = {
  none: "All",
  epic: "No epic",
  parent: "Standalone",
  component: "No component",
};

function laneKeyFor(
  ticket: JiraTicket,
  mode: LiveBoardLaneGrouping,
): string | null {
  if (mode === "epic") {
    return ticket.epic_key || ticket.parent_key || null;
  }
  if (mode === "parent") return ticket.parent_key ?? null;
  if (mode === "component") {
    return ticket.component_name || (ticket.components?.[0] ?? null);
  }
  return null;
}

export function groupTicketsByLane(
  tickets: JiraTicket[],
  mode: LiveBoardLaneGrouping,
): Lane[] {
  if (mode === "none") {
    return [
      {
        laneKey: "_all_",
        laneLabel: FALLBACK_LABEL.none,
        tickets: [...tickets],
        isFallback: false,
      },
    ];
  }

  const fallbackKey = `_fallback_${mode}`;
  const map = new Map<string, Lane>();

  for (const t of tickets) {
    const key = laneKeyFor(t, mode);
    if (key) {
      const existing = map.get(key);
      if (existing) {
        existing.tickets.push(t);
      } else {
        map.set(key, {
          laneKey: key,
          laneLabel: key,
          tickets: [t],
          isFallback: false,
        });
      }
    } else {
      const fb = map.get(fallbackKey);
      if (fb) {
        fb.tickets.push(t);
      } else {
        map.set(fallbackKey, {
          laneKey: fallbackKey,
          laneLabel: FALLBACK_LABEL[mode],
          tickets: [t],
          isFallback: true,
        });
      }
    }
  }

  const lanes = Array.from(map.values());
  lanes.sort((a, b) => {
    if (a.isFallback !== b.isFallback) return a.isFallback ? 1 : -1;
    if (a.tickets.length !== b.tickets.length) {
      return b.tickets.length - a.tickets.length;
    }
    return a.laneLabel.localeCompare(b.laneLabel);
  });

  // Performance ceiling: 50 lanes max (49 real + synthetic "+N more").
  const LANE_CAP = 50;
  if (lanes.length <= LANE_CAP) return lanes;
  const kept = lanes.slice(0, LANE_CAP - 1);
  const overflow = lanes.slice(LANE_CAP - 1);
  const remainingTickets = overflow.flatMap((l) => l.tickets);
  kept.push({
    laneKey: "_overflow_",
    laneLabel: `+${overflow.length} more`,
    tickets: remainingTickets,
    isFallback: true,
  });
  return kept;
}

export function resolveAutoLaneGrouping(
  tickets: JiraTicket[],
): "epic" | "none" {
  if (tickets.length <= 10) return "none";
  const epics = new Set<string>();
  for (const t of tickets) {
    const k = t.epic_key || t.parent_key || "";
    if (k) epics.add(k);
  }
  return epics.size > 1 ? "epic" : "none";
}
