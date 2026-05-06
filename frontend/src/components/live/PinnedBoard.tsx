import { Loader2, PinOff } from "@/lib/icons";
import { usePinnedBoard } from "./hooks/usePinnedBoard";
import { useRoute } from "@/contexts/RouteContext";

interface Props {
  onOpenTicket?: (key: string) => void;
}

export function PinnedBoard({ onOpenTicket }: Props) {
  const { tickets, loading, error, refresh, unpin } = usePinnedBoard();
  const { goto } = useRoute();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Pinned tickets</h2>
          <p className="text-[10.5px] text-ink-faint">
            {tickets.length} pinned · single-machine, stored locally
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="g-btn text-[12px] flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            "Refresh"
          )}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 text-[11.5px] text-err">{error}</div>
      )}

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center px-6">
          <p className="text-[12px] text-ink-muted max-w-sm leading-relaxed">
            Pin tickets from any board's drawer to keep an eye on them across
            sessions.
          </p>
          <button
            type="button"
            onClick={() => goto(["live", "home"])}
            className="mt-3 g-btn text-[12px]"
          >
            Go to boards
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 p-3 overflow-y-auto">
          {tickets.map((t) => (
            <li
              key={t.key}
              className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-elevated px-3 py-2 hover:border-accent/[0.2]"
            >
              <button
                type="button"
                onClick={() => onOpenTicket?.(t.key)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10.5px] text-accent-text">
                    {t.key}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-overlay text-[10px] text-ink-muted">
                    {t.status}
                  </span>
                </div>
                <div className="text-[12px] text-ink truncate">{t.summary}</div>
              </button>
              <button
                type="button"
                onClick={() => unpin(t.key)}
                aria-label="Unpin"
                title="Unpin"
                className="text-ink-muted hover:text-ink"
              >
                <PinOff size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
