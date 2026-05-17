/**
 * Phase 05 / 06c — shimmering placeholder list rendered during AI generation.
 *
 * One skeleton card per requested case. Each card carries a 2px top
 * accent strip in `--ai` so AI authorship is unambiguous. Phase 06c
 * upgrades the placeholder bars to use the canonical `animate-shimmer`
 * keyframe so the loading state visibly streams instead of pulsing in
 * place — matches the `genPhase === 'streaming'` mockup in
 * `plans/UIMockUp-Files/screens_live.jsx`.
 *
 * Layout stays identical to the editable card so the swap to real
 * results does not cause a vertical jump.
 */

import { Sparkles } from "@/lib/icons";
import { CARD_TOP_ACCENT_HEIGHT_PX } from "@/components/live/lib/visualTokens";

interface Props {
  /** Number of skeleton cards to render. */
  count: number;
  /** Optional ticket key shown in the status row. */
  ticketKey?: string;
}

export function GenerationSkeletonList({ count, ticketKey }: Props) {
  const safeCount = Math.max(1, Math.min(20, Math.floor(count)));
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-mono">
        <Sparkles
          size={11}
          className="text-ai animate-pulse-dot"
          aria-hidden="true"
        />
        <span className="text-ai">
          Generating {safeCount} test case{safeCount === 1 ? "" : "s"}
          {ticketKey ? ` for ${ticketKey}` : ""}…
        </span>
      </div>
      <ul
        aria-label="Generating test cases"
        className="flex flex-col gap-2"
      >
        {Array.from({ length: safeCount }).map((_, i) => (
          <li
            key={i}
            className="relative overflow-hidden rounded-lg border border-subtle bg-surface-elevated px-3 py-2.5"
            style={{ borderRadius: "var(--radius-lg, 10px)" }}
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

            {/* Shimmering content — uses canonical `animate-shimmer` keyframe */}
            <div className="flex items-center gap-2 mt-1">
              <span className="block h-3 w-10 rounded animate-shimmer" />
              <span className="block h-3 w-3/5 rounded animate-shimmer" />
              <span className="block h-3 w-10 rounded animate-shimmer ml-auto" />
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <span className="block h-2.5 w-full rounded animate-shimmer" />
              <span className="block h-2.5 w-4/5 rounded animate-shimmer" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
