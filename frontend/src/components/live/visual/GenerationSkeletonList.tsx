/**
 * Phase 05 — shimmering placeholder list rendered during AI generation.
 *
 * One skeleton card per requested case. Each card carries a 2px top
 * accent strip in `--ai` so AI authorship is unambiguous.
 */

import { CARD_TOP_ACCENT_HEIGHT_PX } from "@/components/live/lib/visualTokens";

interface Props {
  /** Number of skeleton cards to render. */
  count: number;
}

export function GenerationSkeletonList({ count }: Props) {
  const safeCount = Math.max(1, Math.min(20, Math.floor(count)));
  return (
    <ul
      role="status"
      aria-label="Generating test cases"
      className="flex flex-col gap-2"
    >
      {Array.from({ length: safeCount }).map((_, i) => (
        <li
          key={i}
          className="relative overflow-hidden rounded-lg border border-subtle bg-surface-elevated px-3 py-2.5"
        >
          {/* AI accent strip */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: CARD_TOP_ACCENT_HEIGHT_PX,
              background: "var(--ai)",
              pointerEvents: "none",
            }}
          />

          {/* Shimmering content */}
          <div className="flex items-center gap-2 mt-1 animate-pulse">
            <div className="h-3 w-12 rounded bg-surface-overlay" />
            <div className="h-3 w-3/5 rounded bg-surface-overlay" />
            <div className="h-3 w-10 rounded bg-surface-overlay ml-auto" />
          </div>
          <div className="mt-2 flex flex-col gap-1 animate-pulse">
            <div className="h-2.5 w-full rounded bg-surface-overlay" />
            <div className="h-2.5 w-4/5 rounded bg-surface-overlay" />
          </div>
        </li>
      ))}
    </ul>
  );
}
