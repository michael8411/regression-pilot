import { useMemo } from "react";
import { BoardColumn } from "@/components/live/BoardColumn";
import { BoardLaneHeader } from "./BoardLaneHeader";
import {
  resolveBoardColumns,
  type ResolvedColumn,
} from "./lib/columnVisibility";
import type { JiraTicket } from "@/types";
import type { LiveBoardDensityKey } from "@/components/live/lib/visualTokens";

const LANE_ACCENTS = [
  "var(--accent)",
  "var(--ai)",
  "var(--warn)",
  "var(--ok)",
  "var(--info)",
  "var(--err)",
];

interface Props {
  laneKey: string;
  laneLabel: string;
  laneIndex: number;
  tickets: JiraTicket[];
  jiraColumns: string[];
  mode: "qa" | "all";
  showEmptyNonQa: boolean;
  density: LiveBoardDensityKey;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (key: string) => void;
}

export function BoardSwimlane({
  laneLabel,
  laneIndex,
  tickets,
  jiraColumns,
  mode,
  showEmptyNonQa,
  density,
  collapsed,
  onToggle,
  onOpen,
}: Props) {
  const byStatus = useMemo(() => {
    const map: Record<string, JiraTicket[]> = {};
    for (const t of tickets) {
      (map[t.status] = map[t.status] ?? []).push(t);
    }
    return map;
  }, [tickets]);

  const resolved: ResolvedColumn[] = useMemo(
    () =>
      resolveBoardColumns({
        jiraColumns,
        byStatus,
        mode,
        showEmptyNonQa,
      }),
    [jiraColumns, byStatus, mode, showEmptyNonQa],
  );

  const accent = LANE_ACCENTS[laneIndex % LANE_ACCENTS.length];

  return (
    <section className="flex flex-col gap-2 mb-4">
      <BoardLaneHeader
        label={laneLabel}
        count={tickets.length}
        collapsed={collapsed}
        onToggle={onToggle}
        accent={accent}
      />
      {!collapsed && (
        <div className="flex gap-3">
          {resolved.map((col) => (
            <BoardColumn
              key={col.status}
              status={col.status}
              tickets={byStatus[col.status] ?? []}
              onOpen={onOpen}
              density={density}
              dim={mode === "all" && col.bucket === "other"}
              slim={mode === "qa" && col.count === 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}
