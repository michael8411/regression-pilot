/**
 * Phase 05 — redesigned ticket card.
 *
 * Composes shared visual primitives:
 *  - <CardTopAccent tone={qaBucket} /> 2px strip.
 *  - <TicketKeyChip> upper-left, <PriorityPill> upper-right.
 *  - <LabelChip> row for ticket.labels (tone via labelTone).
 *  - <InitialAvatar> footer with comment count.
 *
 * Density modes (`compact` | `cozy` | `roomy`) drive padding, gap, and
 * summary line clamp.
 */

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import { MessageSquare, Paperclip } from "@/lib/icons";
import type { JiraTicket } from "@/types";
import {
  CardTopAccent,
  InitialAvatar,
  LabelChip,
  PriorityPill,
  TicketKeyChip,
} from "@/components/live/visual";
import { classifyStatus } from "@/components/live/lib/statusTaxonomy";
import {
  DENSITY_TOKENS,
  type LiveBoardDensityKey,
} from "@/components/live/lib/visualTokens";

interface Props {
  ticket: JiraTicket;
  onOpen: (key: string) => void;
  /** Inherits from the kanban board's density toggle. */
  density?: LiveBoardDensityKey;
  /** Column status this card lives in (used to color the top accent). */
  columnStatus?: string;
}

const MAX_LABELS_DISPLAY = 3;

/**
 * Normalize a ticket's "priority" to one of the four PriorityPill tones.
 * Jira returns labels like "Highest" / "Lowest" — collapse those.
 */
function normalisePriority(p: string | undefined): string | undefined {
  if (!p) return undefined;
  const n = p.toLowerCase();
  if (n === "highest" || n === "critical") return "critical";
  if (n === "high") return "high";
  if (n === "medium") return "medium";
  if (n === "low" || n === "lowest") return "low";
  return undefined;
}

export function TicketCard({
  ticket,
  onOpen,
  density = "cozy",
  columnStatus,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: ticket.key,
      data: { from: ticket.status },
    });

  const tokens = DENSITY_TOKENS[density];

  // Accent tone derives from the QA bucket of the column this card lives in.
  const bucket = classifyStatus(columnStatus ?? ticket.status);

  const priorityTone = normalisePriority(ticket.priority);
  const visibleLabels = (ticket.labels ?? []).slice(0, MAX_LABELS_DISPLAY);
  const hiddenLabelCount = Math.max(
    0,
    (ticket.labels?.length ?? 0) - MAX_LABELS_DISPLAY,
  );
  const commentCount = ticket.comments?.length ?? 0;

  const summaryClamp =
    tokens.summaryClamp === 1
      ? "line-clamp-1"
      : tokens.summaryClamp === 3
        ? "line-clamp-3"
        : "line-clamp-2";

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
        "group relative flex flex-col rounded-lg border cursor-grab",
        "bg-surface-elevated border-subtle hover:border-accent/[0.25]",
        "active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        tokens.padding,
        tokens.gap,
        isDragging && "opacity-60 shadow-lg ring-1 ring-accent/40",
      )}
    >
      {/* 2px top accent — keeps full opacity even when column dims */}
      <CardTopAccent tone={bucket} />

      {/* Row 1: key chip + priority pill */}
      <div className="flex items-center justify-between gap-2">
        <TicketKeyChip ticketKey={ticket.key} priority={priorityTone} />
        {priorityTone && <PriorityPill priority={priorityTone} />}
      </div>

      {/* Row 2: title */}
      <p
        className={clsx(
          "text-[12px] text-ink leading-snug font-medium",
          summaryClamp,
        )}
      >
        {ticket.summary}
      </p>

      {/* Row 3: label chips (omitted in compact density to save space) */}
      {density !== "compact" && visibleLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {visibleLabels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
          {hiddenLabelCount > 0 && (
            <span className="text-[9px] font-mono text-ink-faint">
              +{hiddenLabelCount}
            </span>
          )}
        </div>
      )}

      {/* Row 4: footer */}
      <div className="flex items-center justify-between gap-2 text-[10.5px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <InitialAvatar name={ticket.assignee || "Unassigned"} size={18} />
          {density !== "compact" && (
            <span className="text-ink-secondary truncate">
              {ticket.assignee || "Unassigned"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {commentCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-ink-muted"
              title={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
            >
              <MessageSquare size={10} />
              <span className="text-ink-secondary font-mono">{commentCount}</span>
            </span>
          )}
          {/* Attachment count placeholder — Jira payload doesn't surface this yet.
              Kept here so the visual footprint matches the contract; will wire
              real data when the backend exposes it. */}
          <span
            className="flex items-center gap-0.5 text-ink-muted/40"
            aria-hidden="true"
            title="Attachments unavailable"
          >
            <Paperclip size={10} />
            <span className="font-mono">0</span>
          </span>
        </div>
      </div>
    </article>
  );
}
