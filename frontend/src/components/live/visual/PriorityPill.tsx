/**
 * Phase 04 — priority pill.
 *
 * Uppercase mono pill with bg at 15% alpha and fg from `priorityColor`.
 * Always shows both color and text label (WCAG AA).
 */

import { clsx } from "clsx";
import { priorityColor } from "@/components/live/lib/priorityColors";

interface Props {
  priority: string | null | undefined;
  className?: string;
}

export function PriorityPill({ priority, className }: Props) {
  const { fg, bg, tone } = priorityColor(priority);
  const label = tone.charAt(0).toUpperCase() + tone.slice(1);

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-1.5 py-0.5",
        "text-[9px] font-mono font-semibold uppercase tracking-wider",
        fg,
        bg,
        className,
      )}
      title={`Priority: ${label}`}
    >
      {label}
    </span>
  );
}
