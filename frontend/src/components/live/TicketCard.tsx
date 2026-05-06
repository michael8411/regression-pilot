import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import { User } from "@/lib/icons";
import type { JiraTicket } from "@/types";

interface Props {
  ticket: JiraTicket;
  onOpen: (key: string) => void;
}

export function TicketCard({ ticket, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: ticket.key,
      data: { from: ticket.status },
    });

  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onOpen(ticket.key)}
      onKeyDown={(e) => {
        if (!isDragging && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen(ticket.key);
        }
      }}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={clsx(
        "group flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 cursor-grab",
        "bg-surface-elevated border-subtle hover:border-accent/[0.25]",
        "active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        isDragging && "opacity-60 shadow-lg ring-1 ring-accent/40",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10.5px] text-accent-text">
          {ticket.key}
        </span>
        {ticket.priority && <PriorityBadge priority={ticket.priority} />}
      </div>
      <p className="text-[12px] text-ink leading-snug line-clamp-2">
        {ticket.summary}
      </p>
      <div className="flex items-center justify-between gap-2 text-[10.5px] text-ink-faint">
        <span className="flex items-center gap-1 truncate">
          <User size={9} />
          {ticket.assignee || "Unassigned"}
        </span>
        {ticket.status && (
          <span className="px-1.5 py-0.5 rounded bg-surface-overlay text-ink-muted">
            {ticket.status}
          </span>
        )}
      </div>
    </article>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const tone =
    priority === "Highest" || priority === "High"
      ? "text-err bg-err/[0.08]"
      : priority === "Medium"
        ? "text-warn bg-warn/[0.08]"
        : "text-ink-muted bg-surface-overlay";
  return (
    <span
      className={clsx(
        "text-[9.5px] px-1 py-0.5 rounded font-medium",
        tone,
      )}
    >
      {priority}
    </span>
  );
}
