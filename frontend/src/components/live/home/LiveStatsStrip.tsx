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
}

function buildStats(boards: LiveBoard[]): StatBlock[] {
  const total = boards.length;
  const pinned = boards.filter((b) => b.pinned).length;

  const now = Date.now();
  let recent = 0;
  for (const b of boards) {
    const t = new Date(b.updated_at).getTime();
    if (!Number.isNaN(t) && now - t < UPDATED_24H_MS) recent += 1;
  }

  return [
    {
      label: "Boards",
      value: String(total),
      hint: total === 0 ? "Create your first board" : undefined,
    },
    {
      label: "Pinned",
      value: String(pinned),
      hint: total === 0 ? undefined : `${pinned} of ${total}`,
    },
    {
      label: "Updated · 24h",
      value: String(recent),
    },
    // Phase 04 will replace these placeholders with real per-board insights.
    {
      label: "In-flight",
      value: "—",
      hint: "Available in analytics phase",
      disabled: true,
    },
  ];
}

export function LiveStatsStrip({ boards }: Props) {
  const stats = buildStats(boards);
  return (
    <ul
      aria-label="Live board metrics"
      className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pt-3"
    >
      {stats.map((s) => (
        <li
          key={s.label}
          className={
            "rounded-xl border border-subtle bg-surface-elevated px-3 py-2 " +
            (s.disabled ? "opacity-60" : "")
          }
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-muted">
            {s.label}
          </div>
          <div className="mt-0.5 text-[18px] font-semibold text-ink">
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
