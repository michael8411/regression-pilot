/**
 * Phase 05 — kanban column.
 *
 * Header: <StatusDot> + uppercase mono status label in statusColor(...).fg,
 * inline ticket count in --ink-muted, "+" add-ticket affordance at right.
 *
 * `dim` prop: when true (All columns mode + non-QA bucket), the entire
 * column body renders at opacity 0.6. Card top-accents keep full opacity
 * because they sit in a separate stacking layer per <CardTopAccent />.
 */

import { useDroppable } from "@dnd-kit/core";
import { clsx } from "clsx";
import { Plus } from "@/lib/icons";
import { sortColumn } from "@/components/live/lib/statusColumns";
import { classifyStatus } from "@/components/live/lib/statusTaxonomy";
import { statusColor } from "@/components/live/lib/statusColors";
import { StatusDot } from "@/components/live/visual";
import type { LiveBoardDensityKey } from "@/components/live/lib/visualTokens";
import { TicketCard } from "./TicketCard";
import { EmptyColumn } from "./EmptyColumn";
import type { JiraTicket } from "@/types";

interface Props {
  status: string;
  tickets: JiraTicket[];
  onOpen: (key: string) => void;
  density?: LiveBoardDensityKey;
  /** Dim the column body at 60% opacity (All columns mode, non-QA bucket). */
  dim?: boolean;
  /** Render as a slim placeholder (empty QA column). */
  slim?: boolean;
}

export function BoardColumn({
  status,
  tickets,
  onOpen,
  density = "cozy",
  dim = false,
  slim = false,
}: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
    data: { status },
  });
  const sorted = sortColumn(tickets);

  const bucket = classifyStatus(status);
  const { fg: headerFg } = statusColor(bucket);

  if (slim) {
    return (
      <section
        ref={setNodeRef}
        aria-label={`${status} (0 tickets)`}
        title="No tickets in this column right now."
        className={clsx(
          "flex flex-col w-32 shrink-0 rounded-xl border bg-surface",
          isOver ? "border-accent/[0.4]" : "border-subtle",
        )}
      >
        <header className="flex items-center gap-1.5 px-2 py-1.5">
          <StatusDot tone={bucket} />
          <h3
            className={clsx(
              "text-[10px] font-semibold uppercase font-mono tracking-wider truncate",
              headerFg,
            )}
            title={status}
          >
            {status}
          </h3>
          <span className="ml-auto text-[10px] text-ink-faint font-mono">0</span>
        </header>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={`${status} (${tickets.length} tickets)`}
      className={clsx(
        "flex flex-col w-72 shrink-0 rounded-xl border bg-surface",
        isOver ? "border-accent/[0.4]" : "border-subtle",
      )}
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-subtle">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot tone={bucket} />
          <h3
            className={clsx(
              "text-[10.5px] font-semibold uppercase font-mono tracking-wider truncate",
              headerFg,
            )}
            title={status}
          >
            {status}
          </h3>
          <span className="text-[10.5px] text-ink-muted font-mono">
            {tickets.length}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Add ticket to ${status}`}
          title="Coming soon"
          disabled
          className="w-5 h-5 rounded-md flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-overlay disabled:opacity-40"
        >
          <Plus size={11} />
        </button>
      </header>
      <div
        className={clsx(
          "flex-1 flex flex-col gap-2 p-2 overflow-y-auto transition-opacity",
          dim && "opacity-60",
        )}
      >
        {sorted.length === 0 ? (
          <EmptyColumn />
        ) : (
          sorted.map((t) => (
            <TicketCard
              key={t.key}
              ticket={t}
              onOpen={onOpen}
              density={density}
              columnStatus={status}
            />
          ))
        )}
      </div>
    </section>
  );
}
