import { useDroppable } from "@dnd-kit/core";
import { clsx } from "clsx";
import { sortColumn } from "@/components/live/lib/statusColumns";
import { TicketCard } from "./TicketCard";
import { EmptyColumn } from "./EmptyColumn";
import type { JiraTicket } from "@/types";

interface Props {
  status: string;
  tickets: JiraTicket[];
  onOpen: (key: string) => void;
}

export function BoardColumn({ status, tickets, onOpen }: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
    data: { status },
  });
  const sorted = sortColumn(tickets);

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
        <h3 className="text-[12px] font-semibold text-ink">{status}</h3>
        <span className="text-[10.5px] text-ink-faint">{tickets.length}</span>
      </header>
      <div className="flex-1 flex flex-col gap-2 p-2 overflow-y-auto">
        {sorted.length === 0 ? (
          <EmptyColumn />
        ) : (
          sorted.map((t) => (
            <TicketCard key={t.key} ticket={t} onOpen={onOpen} />
          ))
        )}
      </div>
    </section>
  );
}
