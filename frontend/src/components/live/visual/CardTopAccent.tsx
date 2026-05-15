/**
 * Phase 04 — card top accent strip.
 *
 * Absolutely positioned 2px bar inside every Live Testing card surface.
 * Sits flush with the card's top-left/top-right corners.
 * Callers pass a `tone` (qa bucket) and optionally `varOverride` for non-bucket cases.
 *
 * Rule (locked in 00b):
 *   - TicketCard:      tone = statusColor(column.id).fg
 *   - GeneratedCase:   tone = priorityColor(case.priority).fg
 *   - BoardCard:       tone = "testing" (accent reinforcement)
 */

import { CARD_TOP_ACCENT_HEIGHT_PX } from "@/components/live/lib/visualTokens";
import { statusColor } from "@/components/live/lib/statusColors";

interface Props {
  /** QA bucket string passed to statusColor. */
  tone?: string;
  /** Raw CSS color value for overrides (bypasses statusColor). */
  varOverride?: string;
}

export function CardTopAccent({ tone = "testing", varOverride }: Props) {
  const color = varOverride ?? `var(${statusColor(tone).varName})`;
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: CARD_TOP_ACCENT_HEIGHT_PX,
        background: color,
        borderRadius: "var(--radius-lg, 10px) var(--radius-lg, 10px) 0 0",
        pointerEvents: "none",
      }}
    />
  );
}
