/**
 * Phase 04 — colored dot encoding a QA bucket status.
 *
 * Always paired with a text label for accessibility (color is not the sole
 * signal). 6px filled circle using `statusColor(tone).fg`.
 */

import { statusColor, type QaBucketTone } from "@/components/live/lib/statusColors";

interface Props {
  tone: QaBucketTone | string;
  /** Override default 6px size. */
  size?: number;
  className?: string;
}

export function StatusDot({ tone, size = 6, className }: Props) {
  const { fg, varName } = statusColor(tone);
  return (
    <span
      role="presentation"
      aria-hidden="true"
      className={`inline-block rounded-full shrink-0 ${fg} ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        backgroundColor: `var(${varName})`,
      }}
    />
  );
}
