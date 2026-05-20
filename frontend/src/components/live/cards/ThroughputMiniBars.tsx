/**
 * Phase 04 — 7-day throughput mini-bars.
 *
 * Always renders exactly 7 bars (oldest to newest).
 * Non-zero days: --ok at full alpha.
 * Zero days: --ok at 25% alpha.
 * Bar dimensions: 4px wide, 2px gap, total height 24px.
 */

import type { LiveBoardThroughputPoint } from "@/types/live";

interface Props {
  points: LiveBoardThroughputPoint[];
  className?: string;
}

export function ThroughputMiniBars({ points, className }: Props) {
  // Ensure exactly 7 points, padding with zeros if needed.
  const normalised = Array.from({ length: 7 }, (_, i) => points[i] ?? { day: "", done: 0 });
  const maxDone = Math.max(...normalised.map((p) => p.done), 1);

  const totalDone = normalised.reduce((sum, p) => sum + p.done, 0);

  return (
    <div
      role="img"
      aria-label={`7-day throughput: ${totalDone} tickets closed`}
      className={`flex items-end ${className ?? ""}`}
      style={{ gap: 2, height: 24 }}
    >
      {normalised.map((p, i) => {
        const heightPct = p.done > 0 ? Math.max(0.15, p.done / maxDone) : 0;
        const isEmpty = p.done === 0;

        return (
          <div
            key={p.day || i}
            title={p.day ? `${p.day}: ${p.done} done` : `Day ${i + 1}: 0 done`}
            style={{
              width: 4,
              height: isEmpty ? 3 : Math.round(heightPct * 24),
              background: isEmpty
                ? "color-mix(in srgb, var(--ok), transparent 75%)"
                : "var(--ok)",
              borderRadius: 2,
              transition: "height 0.3s ease",
            }}
          />
        );
      })}
    </div>
  );
}
