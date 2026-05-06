import { Loader2, RefreshCw } from "@/lib/icons";
import { useBoard } from "./BoardProvider";

export function BoardToolbar() {
  const { board, fetchedAt, loading, refresh } = useBoard();
  if (!board) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-ink truncate">
          {board.name}
        </h2>
        <code className="block text-[10.5px] text-ink-faint truncate font-mono">
          {board.jql}
        </code>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] text-ink-faint">
          {fetchedAt ? `Updated ${formatTime(fetchedAt)}` : "—"}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="Refresh"
          title="Refresh"
          disabled={loading}
          className="g-btn text-[12px] px-2 py-1 flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <RefreshCw size={11} />
          )}
          Refresh
        </button>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
