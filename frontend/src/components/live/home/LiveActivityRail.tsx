import { Activity, History } from "@/lib/icons";
import { useCommandRegistry } from "@/contexts/CommandRegistryContext";

/**
 * Phase 02 — sticky activity rail.
 * Phase 04 patch — elevated surface + pulsing accent dot per visual contract.
 *
 * Render a production-safe placeholder strategy: in-memory recent events
 * are surfaced when callers pass them, otherwise we show an empty-state
 * copy (no fabricated events). Phase 06 wires the durable
 * `live_activity` feed; the contract is locked in Phase 01.
 *
 * Local-only state is intentionally read from props, NOT from
 * `localStorage` — durable Live workflow state must use encrypted SQLite
 * per the master roadmap.
 */

export interface LiveActivityRailEntry {
  id: string;
  /** Short human-readable summary, e.g. "Created board FM Mobile". */
  summary: string;
  /** ISO timestamp for relative display. */
  at: string;
  /** Optional secondary line. */
  detail?: string;
}

interface Props {
  /**
   * In-memory recent activity. May be empty; never inject fake events.
   * Phase 06 will replace this with the durable artifact feed.
   */
  entries: LiveActivityRailEntry[];
}

const HISTORY_COMMAND_ID = "jump.history";

export function LiveActivityRail({ entries }: Props) {
  const { commands } = useCommandRegistry();

  const openHistory = () => {
    const cmd = commands.find((c) => c.id === HISTORY_COMMAND_ID);
    if (!cmd) return;
    if (cmd.action.type === "run") {
      void cmd.action.run();
    }
  };

  return (
    <aside
      aria-label="Live activity"
      className="hidden lg:flex sticky top-0 self-start w-[280px] shrink-0 flex-col h-full border-l border-subtle bg-surface-elevated rounded-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <div className="flex items-center gap-1.5 text-ink">
          {/* Pulsing accent dot — live indicator */}
          <span className="relative inline-flex items-center justify-center w-2.5 h-2.5 shrink-0">
            <span
              className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping"
              style={{ background: "var(--accent)" }}
            />
            <span
              className="relative inline-flex rounded-full w-1.5 h-1.5"
              style={{ background: "var(--accent)" }}
            />
          </span>
          <Activity size={12} className="text-accent-text" />
          <h2 className="text-[12px] font-semibold">Activity</h2>
        </div>
        <button
          type="button"
          onClick={openHistory}
          className="text-[10.5px] text-ink-muted hover:text-ink underline-offset-2 hover:underline flex items-center gap-1"
        >
          <History size={11} />
          View history
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <EmptyRail />
        ) : (
          <ul className="flex flex-col">
            {entries.map((e) => (
              <li
                key={e.id}
                className="px-4 py-3 border-b border-subtle/60 last:border-b-0"
              >
                <div className="text-[12px] text-ink leading-snug truncate">
                  {e.summary}
                </div>
                {e.detail && (
                  <div className="mt-0.5 text-[10.5px] text-ink-muted truncate">
                    {e.detail}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-ink-faint font-mono">
                  {relativeTime(e.at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function EmptyRail() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-9 h-9 rounded-lg bg-surface-overlay border border-subtle flex items-center justify-center mb-3">
        <Activity size={14} className="text-ink-muted" />
      </div>
      <p className="text-[11.5px] text-ink-muted leading-relaxed max-w-[220px]">
        Recent Live actions will appear here as you work — pins, generated
        cases, comments, and transitions.
      </p>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
