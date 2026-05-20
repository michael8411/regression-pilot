/**
 * Phase 06 — high-density pinned tickets table.
 *
 * Sort defaults:
 *   primary   = priority severity (critical > high > medium > low),
 *   secondary = updated_at desc.
 *
 * Header is uppercase mono --ink-muted with letter-spacing: 0.08em and a
 * small chevron accent (--accent) on the active sort column.
 */

import { useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, Pin } from "@/lib/icons";
import { useRoute } from "@/contexts/RouteContext";
import type { JiraTicket } from "@/types";
import { PinnedTicketsRow } from "./PinnedTicketsRow";

export type PinnedSortKey = "priority" | "updated" | "key" | "status";

interface Props {
  tickets: JiraTicket[];
  loading: boolean;
  onOpen: (key: string) => void;
  onUnpin: (key: string) => void;
}

const PRIORITY_RANK: Record<string, number> = {
  highest: 5,
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  lowest: 1,
};

function priorityRank(priority: string | undefined | null): number {
  return PRIORITY_RANK[(priority ?? "").toLowerCase()] ?? 0;
}

function updatedMs(t: JiraTicket): number {
  const raw = t.updated || t.created || "";
  if (!raw) return 0;
  const n = new Date(raw).getTime();
  return Number.isNaN(n) ? 0 : n;
}

function compare(
  a: JiraTicket,
  b: JiraTicket,
  primary: PinnedSortKey,
  dir: 1 | -1,
): number {
  let cmp = 0;
  switch (primary) {
    case "priority":
      cmp = priorityRank(b.priority) - priorityRank(a.priority);
      break;
    case "updated":
      cmp = updatedMs(b) - updatedMs(a);
      break;
    case "key":
      cmp = a.key.localeCompare(b.key);
      break;
    case "status":
      cmp = (a.status || "").localeCompare(b.status || "");
      break;
  }
  cmp = cmp * dir;
  // Secondary: updated desc.
  if (cmp === 0) return updatedMs(b) - updatedMs(a);
  return cmp;
}

export function PinnedTicketsTable({
  tickets,
  loading,
  onOpen,
  onUnpin,
}: Props) {
  const { goto } = useRoute();
  const [sortKey, setSortKey] = useState<PinnedSortKey>("priority");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    return [...tickets].sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [tickets, sortKey, sortDir]);

  const toggleSort = (key: PinnedSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  if (tickets.length === 0 && !loading) {
    return (
      <div
        role="status"
        className="flex flex-col items-center justify-center flex-1 px-6 py-10 text-center"
      >
        <div className="w-12 h-12 rounded-xl bg-surface-overlay border border-subtle flex items-center justify-center mb-3">
          <Pin size={18} className="text-ink-muted" />
        </div>
        <p className="text-[13px] font-medium text-ink-secondary mb-1">
          No pinned tickets yet
        </p>
        <p className="text-[11.5px] text-ink-muted max-w-[320px] leading-relaxed mb-4">
          Open any ticket from a Live board and use the pin action to keep an
          eye on it across sessions. Pins are encrypted and stored locally.
        </p>
        <button
          type="button"
          onClick={() => goto(["live", "home"])}
          className="g-btn text-[12px] px-3 py-1.5"
        >
          Go to boards
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-2">
      <table
        role="table"
        className="w-full border-separate"
        style={{ borderSpacing: "0 2px" }}
      >
        <thead>
          <tr role="row">
            <HeaderCell
              label="Key"
              sortKey="key"
              active={sortKey === "key"}
              dir={sortDir}
              onClick={() => toggleSort("key")}
            />
            <HeaderCell label="Summary" />
            <HeaderCell
              label="Status"
              sortKey="status"
              active={sortKey === "status"}
              dir={sortDir}
              onClick={() => toggleSort("status")}
            />
            <HeaderCell
              label="Priority"
              sortKey="priority"
              active={sortKey === "priority"}
              dir={sortDir}
              onClick={() => toggleSort("priority")}
            />
            <HeaderCell label="Assignee" />
            <HeaderCell label="" align="right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <PinnedTicketsRow
              key={t.key}
              ticket={t}
              onOpen={onOpen}
              onUnpin={onUnpin}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface HeaderCellProps {
  label: ReactNode;
  /** Unused at runtime — kept on the call site for code self-documentation. */
  sortKey?: PinnedSortKey;
  active?: boolean;
  dir?: 1 | -1;
  onClick?: () => void;
  align?: "left" | "right";
}

function HeaderCell({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: HeaderCellProps) {
  const sortable = typeof onClick === "function";
  return (
    <th
      role="columnheader"
      scope="col"
      className={clsx(
        "px-3 pb-1.5 pt-2 text-[10px] font-mono uppercase text-ink-muted font-semibold",
        align === "right" ? "text-right" : "text-left",
      )}
      style={{ letterSpacing: "0.08em" }}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onClick}
          className={clsx(
            "inline-flex items-center gap-1 hover:text-ink-secondary transition-colors",
            active && "text-ink-secondary",
          )}
        >
          {label}
          {active &&
            (dir === 1 ? (
              <ChevronDown size={10} className="text-accent-text" />
            ) : (
              <ChevronUp size={10} className="text-accent-text" />
            ))}
        </button>
      ) : (
        <span>{label}</span>
      )}
    </th>
  );
}

// Used by sort dir union — exported for tests / consumers.
export type { PinnedSortKey as _PinnedSortKey };
