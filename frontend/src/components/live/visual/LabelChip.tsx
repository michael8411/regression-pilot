/**
 * Phase 04 — label chip with automatic tone assignment.
 *
 * Tone is resolved via `labelTone(label)` — no per-chip color prop needed.
 * Uppercase mono with bg at 12% alpha.
 */

import { clsx } from "clsx";
import { labelTone } from "@/components/live/lib/labelTone";

interface Props {
  label: string;
  className?: string;
}

export function LabelChip({ label, className }: Props) {
  const { fg, bg } = labelTone(label);
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-1.5 py-0.5",
        "text-[9px] font-mono font-semibold uppercase tracking-wider truncate max-w-[120px]",
        fg,
        bg,
        className,
      )}
      title={label}
    >
      {label}
    </span>
  );
}
