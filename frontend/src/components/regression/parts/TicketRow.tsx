import type { JiraTicket } from "@/types";
import { Avatar, Badge, Checkbox, PriorityPill, type Priority } from "@/components/ui";
import { ExternalLink } from "@/lib/icons";
import { hueFrom, initialsFrom } from "@/lib/avatar";
import { cn } from "@/lib/cn";

export interface TicketRowProps {
  ticket: JiraTicket;
  selected: boolean;
  onToggle: () => void;
  jiraBaseUrl: string | null;
}

/**
 * One ticket row in the workbench list. The whole row is a click target
 * (toggles selection); the Jira key and the checkbox are independent
 * tab stops so keyboard users can reach both.
 */
export function TicketRow({
  ticket,
  selected,
  onToggle,
  jiraBaseUrl,
}: TicketRowProps) {
  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Skip when the click came from the link or checkbox — they handle themselves.
    const target = e.target as HTMLElement;
    if (target.closest("a") || target.closest("input")) return;
    onToggle();
  };

  const handleRowKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      // Don't intercept when focus is on a child input/link.
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "A") return;
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKey}
      className={cn(
        "group flex items-center gap-3 px-4 py-2 border-b border-subtle",
        "cursor-pointer transition-colors duration-fast ease-smooth",
        "border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        selected
          ? "bg-accent/[0.07] border-l-accent"
          : "hover:bg-surface-overlay border-l-transparent",
      )}
    >
      <Checkbox
        checked={selected}
        onChange={() => onToggle()}
        size="sm"
        aria-label={`Select ${ticket.key}`}
      />

      {jiraBaseUrl ? (
        <a
          href={`${jiraBaseUrl}/browse/${ticket.key}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "font-mono text-[11px] tabular-nums text-ink-muted",
            "hover:text-accent-text w-[80px] shrink-0 inline-flex items-center gap-1",
          )}
        >
          {ticket.key}
          <ExternalLink size={11} className="opacity-0 group-hover:opacity-100" />
        </a>
      ) : (
        <span className="font-mono text-[11px] tabular-nums text-ink-muted w-[80px] shrink-0">
          {ticket.key}
        </span>
      )}

      <span className="flex-1 truncate text-[13px] text-ink-secondary">
        {ticket.summary}
      </span>

      <Badge tone={statusToTone(ticket.status)} size="sm">
        {ticket.status}
      </Badge>

      <PriorityPill priority={normalizePriority(ticket.priority)} size="sm" />

      {ticket.assignee ? (
        <Avatar
          a={{
            initials: initialsFrom(ticket.assignee) || "?",
            hue: hueFrom(ticket.assignee),
            label: ticket.assignee,
          }}
          size={20}
        />
      ) : (
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface-overlay text-ink-muted text-[10px]"
          title="Unassigned"
        >
          —
        </span>
      )}
    </div>
  );
}

function statusToTone(
  status: string,
): "ok" | "warn" | "info" | "neutral" {
  if (status === "Closed" || status === "Done" || status === "Resolved") return "ok";
  if (status === "Open" || status === "To Do" || status === "Reopened") return "warn";
  if (status === "In Progress" || status === "In Review") return "info";
  return "neutral";
}

/** PriorityPill only accepts Critical|High|Medium|Low. Coerce stray Jira values. */
function normalizePriority(p: string): Priority {
  if (p === "Critical" || p === "Highest") return "Critical";
  if (p === "High") return "High";
  if (p === "Medium") return "Medium";
  return "Low"; // covers "Low", "Lowest", "", or anything unexpected
}
