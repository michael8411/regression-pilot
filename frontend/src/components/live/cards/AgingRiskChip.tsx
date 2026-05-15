/**
 * Phase 04 — aging risk chip.
 *
 * Displays the staleness of in-flight tickets as a small pill:
 *   Low     (<20%)   → --ink-muted
 *   Moderate (20-39%) → --warn
 *   High    (>=40%)  → --err
 *
 * Always shows a leading color dot for visual scanning.
 */

import { clsx } from "clsx";

interface Props {
  /** Percentage of in-flight tickets older than threshold (0–100). */
  agingRiskPct: number;
  className?: string;
}

interface RiskLevel {
  label: "Low" | "Moderate" | "High";
  fg: string;
  bg: string;
  dotVar: string;
}

function riskLevel(pct: number): RiskLevel {
  if (pct >= 40) {
    return {
      label: "High",
      fg: "text-err",
      bg: "bg-err/[0.12]",
      dotVar: "--err",
    };
  }
  if (pct >= 20) {
    return {
      label: "Moderate",
      fg: "text-warn",
      bg: "bg-warn/[0.12]",
      dotVar: "--warn",
    };
  }
  return {
    label: "Low",
    fg: "text-ink-muted",
    bg: "bg-surface-overlay",
    dotVar: "--ink-muted",
  };
}

export function AgingRiskChip({ agingRiskPct, className }: Props) {
  const { label, fg, bg, dotVar } = riskLevel(agingRiskPct);

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
        "text-[9px] font-mono font-medium",
        fg,
        bg,
        className,
      )}
      title={`Aging risk: ${label} (${agingRiskPct}% of in-flight tickets stale)`}
    >
      <span
        className="inline-block rounded-full shrink-0"
        style={{
          width: 5,
          height: 5,
          background: `var(${dotVar})`,
        }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
