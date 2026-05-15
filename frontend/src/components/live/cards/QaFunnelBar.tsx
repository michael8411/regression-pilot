/**
 * Phase 04 — QA funnel bar.
 *
 * Horizontal segmented bar: ready / testing / done.
 * Segments use `statusColor` fg tokens. Empty segments render at 12% alpha.
 * Bar height: 8px, corners: var(--radius-sm).
 */

import { statusColor } from "@/components/live/lib/statusColors";
import type { LiveBoardFunnel } from "@/types/live";

interface Props {
  funnel: LiveBoardFunnel;
  className?: string;
}

const SEGMENTS: { key: keyof LiveBoardFunnel; label: string; tone: string }[] =
  [
    { key: "ready", label: "Ready", tone: "ready" },
    { key: "testing", label: "Testing", tone: "testing" },
    { key: "done", label: "Done", tone: "done" },
  ];

export function QaFunnelBar({ funnel, className }: Props) {
  const total = funnel.ready + funnel.testing + funnel.done;

  return (
    <div
      role="img"
      aria-label={`QA funnel: ${funnel.ready} ready, ${funnel.testing} testing, ${funnel.done} done`}
      className={`flex items-stretch gap-px overflow-hidden ${className ?? ""}`}
      style={{ height: 8, borderRadius: "var(--radius-sm, 4px)" }}
    >
      {SEGMENTS.map(({ key, label, tone }) => {
        const count = funnel[key];
        const pct = total > 0 ? (count / total) * 100 : 0;
        const isEmpty = count === 0;
        const { varName } = statusColor(tone);

        return (
          <div
            key={key}
            title={`${label}: ${count}`}
            style={{
              flex: total > 0 ? pct : 1,
              background: isEmpty
                ? `color-mix(in srgb, var(${varName}), transparent 88%)`
                : `var(${varName})`,
              minWidth: isEmpty ? 4 : 0,
              transition: "flex 0.3s ease",
            }}
          />
        );
      })}
    </div>
  );
}
