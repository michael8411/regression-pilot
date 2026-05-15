/**
 * Phase 06 — pinned tickets view backed by encrypted SQLite.
 *
 * Renders the high-density <PinnedTicketsTable> and a refresh control.
 * Empty state + per-row drawer open + per-row unpin all live inside the
 * table component.
 */

import { Loader2 } from "@/lib/icons";
import { usePinnedBoard } from "./hooks/usePinnedBoard";
import { PinnedTicketsTable } from "./pinned";

interface Props {
  onOpenTicket?: (key: string) => void;
}

export function PinnedBoard({ onOpenTicket }: Props) {
  const { tickets, loading, error, refresh, unpin } = usePinnedBoard();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Pinned tickets</h2>
          <p className="text-[10.5px] text-ink-faint">
            {tickets.length} pinned · encrypted at rest
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

      <PinnedTicketsTable
        tickets={tickets}
        loading={loading}
        onOpen={(k) => onOpenTicket?.(k)}
        onUnpin={(k) => unpin(k)}
      />
    </div>
  );
}
