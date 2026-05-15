import { Plus, RefreshCw } from "@/lib/icons";

interface Props {
  onAddBoard: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function LiveHomeHeader({
  onAddBoard,
  onRefresh,
  refreshing,
}: Props) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
      <div className="min-w-0">
        <h1 className="text-[14px] font-semibold text-ink truncate">
          Live Testing
        </h1>
        <p className="text-[11px] text-ink-faint truncate">
          Boards you are actively testing. Click to open the Kanban view.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          aria-label="Refresh boards"
          title="Refresh boards"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          className="w-8 h-8 rounded-md flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-overlay disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            className={refreshing ? "animate-spin" : undefined}
          />
        </button>
        <button
          type="button"
          onClick={onAddBoard}
          className="g-btn-solid text-[12px] px-3 py-1.5 flex items-center gap-1.5"
        >
          <Plus size={11} /> Add board
        </button>
      </div>
    </header>
  );
}
