import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PriorityPill, type Priority } from "@/components/ui";
import { GripVertical } from "@/lib/icons";
import { cn } from "@/lib/cn";
import type { JiraTicket } from "@/types";

export interface DraggableTicketProps {
  ticket: JiraTicket;
  columnName: string;
  index: number;
}

/**
 * One ticket card inside a theme column. The whole card is the drag
 * handle (via dnd-kit listeners). Spec: keyboard-draggable via tab + space.
 */
export function DraggableTicket({
  ticket,
  columnName,
  index,
}: DraggableTicketProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ticket.key,
    data: { columnName, index },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={`Drag ${ticket.key}: ${ticket.summary}`}
      className={cn(
        "flex items-start gap-2 p-2 rounded-md",
        "bg-surface-elevated border border-subtle",
        "cursor-grab active:cursor-grabbing select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        isDragging && "opacity-50 shadow-float",
      )}
    >
      <GripVertical
        size={14}
        className="text-ink-muted shrink-0 mt-0.5"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">
            {ticket.key}
          </span>
          <PriorityPill priority={normalizePriority(ticket.priority)} size="sm" />
        </div>
        <p className="text-[12px] text-ink-secondary mt-0.5 clamp2">
          {ticket.summary}
        </p>
      </div>
    </div>
  );
}

/** PriorityPill only accepts Critical|High|Medium|Low. Coerce stray Jira values. */
function normalizePriority(p: string): Priority {
  if (p === "Critical" || p === "Highest") return "Critical";
  if (p === "High") return "High";
  if (p === "Medium") return "Medium";
  return "Low";
}
