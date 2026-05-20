/**
 * Phase 04 patch — semantic tile colors now that the shared color tokens exist.
 *
 * Tile set updated to match the redesign (00b-live-testing-visual-design-language.md):
 *   Boards tracking → --ink
 *   Ready to test   → --warn
 *   In testing      → --accent
 *   Closed today    → --err
 *   Cases generated → --ai
 *
 * Phase 02 implemented the structural shell. Phase 04 brings the semantic number colors
 * and the correct tile names/count now that the stats reflect real analytics data.
 */

import type { LiveBoard } from "@/types/live";

interface Props {
  boards: LiveBoard[];
}

const UPDATED_24H_MS = 24 * 60 * 60 * 1000;

interface StatBlock {
  label: string;
  value: string;
  hint?: string;
  disabled?: boolean;
  /** Tailwind text class for the numeric value. */
  valueColor: string;
}

function buildStats(boards: LiveBoard[]): StatBlock[] {
  const total = boards.length;

  const now = Date.now();
  let closedToday = 0;
  for (const b of boards) {
    const t = new Date(b.updated_at).getTime();
    if (!Number.isNaN(t) && now - t < UPDATED_24H_MS) closedToday += 1;
  }

  return [
    {
      label: "Boards tracking",
      value: String(total),
      hint: total === 0 ? "Create your first board" : undefined,
      valueColor: "text-ink",
    },
    {
      label: "Ready to test",
      value: "—",
      hint: "Available once boards load",
      disabled: true,
      valueColor: "text-warn",
    },
    {
      label: "In testing",
      value: "—",
      hint: "Available once boards load",
      disabled: true,
      valueColor: "text-accent-text",
    },
    {
      label: "Closed today",
      value: closedToday > 0 ? String(closedToday) : "0",
      hint: undefined,
      valueColor: "text-err",
    },
    {
      label: "Cases generated",
      value: "—",
      hint: "Phase 06 analytics",
      disabled: true,
      valueColor: "text-ai",
    },
  ];
}

export function LiveStatsStrip({ boards }: Props) {
  const stats = buildStats(boards);
  return (
    <ul
      aria-label="Live board metrics"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 px-4 pt-3"
    >
      {stats.map((s) => (
        <li
          key={s.label}
          className={
            "rounded-xl border border-subtle bg-surface-elevated px-3 py-2 " +
            (s.disabled ? "opacity-60" : "")
          }
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-muted truncate">
            {s.label}
          </div>
          <div className={`mt-0.5 text-[18px] font-semibold ${s.valueColor}`}>
            {s.value}
          </div>
          {s.hint && (
            <div className="text-[10.5px] text-ink-faint truncate">
              {s.hint}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
