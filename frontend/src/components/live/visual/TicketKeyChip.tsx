/**
 * Phase 04 — ticket key chip.
 *
 * Default tone: `--accent-text` over `--accent-dim`.
 * When `priority` is supplied, tone overrides to `priorityColor(priority)`.
 */

import { clsx } from "clsx";
import { priorityColor } from "@/components/live/lib/priorityColors";

interface Props {
  ticketKey: string;
  priority?: string | null;
  className?: string;
}

export function TicketKeyChip({ ticketKey, priority, className }: Props) {
  const hasPriority = Boolean(priority);
  const { fg, bg } = hasPriority
    ? priorityColor(priority)
    : { fg: "text-accent-text", bg: "bg-accent-dim" };

  return (
    <span
      aria-label={ticketKey}
      className={clsx(
        "inline-flex items-center rounded-md px-1.5 py-0.5",
        "text-[9px] font-mono font-semibold tracking-wide shrink-0",
        fg,
        bg,
        className,
      )}
    >
      {ticketKey}
    </span>
  );
}
