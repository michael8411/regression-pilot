/**
 * Phase 04 — canonical status → visual token mapping.
 *
 * `statusColor(bucketOrColumnId)` returns a descriptor that every Live surface
 * must import instead of hard-coding a color. No raw hex values in callers.
 *
 * Canonical mapping (locked in 00b-live-testing-visual-design-language.md):
 *   ready    → --warn  (amber)
 *   testing  → --accent (teal)
 *   done     → --ok   (green)
 *   blocked  → --err  (red)
 *   other    → --ink-muted (neutral)
 */

export type QaBucketTone =
  | "ready"
  | "testing"
  | "done"
  | "blocked"
  | "neutral";

export interface StatusColorDescriptor {
  /** Short tone key used for aria-label and data attributes. */
  tone: QaBucketTone;
  /** CSS custom property name (without `var()`). */
  varName: string;
  /** Tailwind foreground class — use for text/icon color. */
  fg: string;
  /** Tailwind background class at 15% alpha — use for pill/chip bg. */
  bg: string;
}

const COLOR_MAP: Record<QaBucketTone, StatusColorDescriptor> = {
  ready: {
    tone: "ready",
    varName: "--warn",
    fg: "text-warn",
    bg: "bg-warn/[0.15]",
  },
  testing: {
    tone: "testing",
    varName: "--accent",
    fg: "text-accent-text",
    bg: "bg-accent/[0.15]",
  },
  done: {
    tone: "done",
    varName: "--ok",
    fg: "text-ok",
    bg: "bg-ok/[0.15]",
  },
  blocked: {
    tone: "blocked",
    varName: "--err",
    fg: "text-err",
    bg: "bg-err/[0.15]",
  },
  neutral: {
    tone: "neutral",
    varName: "--ink-muted",
    fg: "text-ink-muted",
    bg: "bg-surface-overlay",
  },
};

/**
 * Converts a qa-bucket string or raw column label into a
 * `StatusColorDescriptor`. Unknown / non-QA buckets resolve to `neutral`.
 */
export function statusColor(
  bucketOrColumnId: string | null | undefined,
): StatusColorDescriptor {
  const key = (bucketOrColumnId ?? "").toLowerCase().trim();

  if (key === "ready" || key === "ready to test" || key === "ready for qa") {
    return COLOR_MAP.ready;
  }
  if (
    key === "testing" ||
    key === "in testing" ||
    key === "in_testing" ||
    key === "qa in progress"
  ) {
    return COLOR_MAP.testing;
  }
  if (
    key === "done" ||
    key === "closed" ||
    key === "resolved" ||
    key === "complete" ||
    key === "completed"
  ) {
    return COLOR_MAP.done;
  }
  if (key === "blocked" || key === "impediment") {
    return COLOR_MAP.blocked;
  }
  // todo / in_progress / in_review / other non-QA buckets
  return COLOR_MAP.neutral;
}
