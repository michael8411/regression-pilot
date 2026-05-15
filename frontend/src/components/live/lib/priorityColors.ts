/**
 * Phase 04 — canonical priority → visual token mapping.
 *
 * Locked in 00b-live-testing-visual-design-language.md:
 *   critical → --err
 *   high     → --warn
 *   medium   → --info
 *   low      → --ink-muted
 */

export type PriorityLevel = "critical" | "high" | "medium" | "low";

export interface PriorityColorDescriptor {
  tone: PriorityLevel;
  varName: string;
  /** Tailwind foreground class. */
  fg: string;
  /** Tailwind background class at 15% alpha. */
  bg: string;
}

const PRIORITY_MAP: Record<PriorityLevel, PriorityColorDescriptor> = {
  critical: {
    tone: "critical",
    varName: "--err",
    fg: "text-err",
    bg: "bg-err/[0.15]",
  },
  high: {
    tone: "high",
    varName: "--warn",
    fg: "text-warn",
    bg: "bg-warn/[0.15]",
  },
  medium: {
    tone: "medium",
    varName: "--info",
    fg: "text-info",
    bg: "bg-info/[0.15]",
  },
  low: {
    tone: "low",
    varName: "--ink-muted",
    fg: "text-ink-muted",
    bg: "bg-surface-overlay",
  },
};

const FALLBACK: PriorityColorDescriptor = PRIORITY_MAP.low;

/**
 * Returns a `PriorityColorDescriptor` for the given priority string.
 * Case-insensitive. Unknown priorities resolve to the `low` (neutral) slot.
 */
export function priorityColor(
  priority: string | null | undefined,
): PriorityColorDescriptor {
  const key = (priority ?? "").toLowerCase().trim() as PriorityLevel;
  return PRIORITY_MAP[key] ?? FALLBACK;
}
