/**
 * Phase 06 — Pinned table row.
 *
 * Cells per the visual contract (00b):
 *   KEY      → <TicketKeyChip>
 *   SUMMARY  → --ink, single-line truncate
 *   STATUS   → <StatusDot tone={qaBucket} /> + status text in --ink-secondary
 *   PRIORITY → <PriorityPill>
 *   ASSIGNEE → <InitialAvatar> + name in --ink-secondary
 *
 * Hover: bg surface-overlay/60, shadow-glow-sm.
 * Click anywhere except the unpin affordance opens the drawer.
 */

import { clsx } from "clsx";
import { PinOff } from "@/lib/icons";
import {
  InitialAvatar,
  PriorityPill,
  StatusDot,
  TicketKeyChip,
} from "@/components/live/visual";
import { classifyStatus } from "@/components/live/lib/statusTaxonomy";
import type { JiraTicket } from "@/types";

interface Props {
  ticket: JiraTicket;
  onOpen: (key: string) => void;
  onUnpin: (key: string) => void;
}

function normalisePriority(p: string | undefined): string | undefined {
  if (!p) return undefined;
  const n = p.toLowerCase();
  if (n === "highest" || n === "critical") return "critical";
  if (n === "high") return "high";
  if (n === "medium") return "medium";
  if (n === "low" || n === "lowest") return "low";
  return undefined;
}

export function PinnedTicketsRow({ ticket, onOpen, onUnpin }: Props) {
  const priorityTone = normalisePriority(ticket.priority);
  const bucket = ticket.status ? classifyStatus(ticket.status) : "neutral";

  const handleRowClick = () => onOpen(ticket.key);
  const handleRowKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(ticket.key);
    }
  };

  return (
    <tr
      role="row"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKey}
      aria-label={`Pinned ticket ${ticket.key}: ${ticket.summary}`}
      className={clsx(
        "group cursor-pointer outline-none",
        "transition-shadow",
        "hover:bg-surface-overlay/60 hover:shadow-glow-sm",
        "focus-visible:bg-surface-overlay/60 focus-visible:shadow-glow-sm",
      )}
      style={{ borderRadius: "var(--radius-md, 6px)" }}
    >
      {/* KEY */}
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        <TicketKeyChip ticketKey={ticket.key} priority={priorityTone} />
      </td>

      {/* SUMMARY */}
      <td className="px-3 py-2 align-middle">
        <div className="text-[12px] text-ink truncate max-w-[420px]">
          {ticket.summary || "—"}
        </div>
      </td>

      {/* STATUS */}
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
          <StatusDot tone={bucket} />
          {ticket.status || "—"}
        </span>
      </td>

      {/* PRIORITY */}
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        {priorityTone ? (
          <PriorityPill priority={priorityTone} />
        ) : (
          <span className="text-[10.5px] text-ink-faint font-mono">—</span>
        )}
      </td>

      {/* ASSIGNEE */}
      <td className="px-3 py-2 align-middle">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary truncate max-w-[180px]">
          <InitialAvatar name={ticket.assignee || "Unassigned"} size={20} />
          <span className="truncate">{ticket.assignee || "Unassigned"}</span>
        </span>
      </td>

      {/* UNPIN affordance */}
      <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
        <button
          type="button"
          aria-label={`Unpin ${ticket.key}`}
          title="Unpin"
          onClick={(e) => {
            e.stopPropagation();
            onUnpin(ticket.key);
          }}
          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-muted hover:text-err hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <PinOff size={12} />
        </button>
      </td>
    </tr>
  );
}
