import { Plus } from "@/lib/icons";

interface Props {
  onClick: () => void;
}

export function AddBoardTile({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add board"
      className={
        "group flex flex-col items-center justify-center gap-2 rounded-xl " +
        "border border-dashed border-muted hover:border-accent/[0.5] " +
        "bg-surface-overlay/30 hover:bg-accent-dim/40 " +
        "transition-colors text-ink-muted hover:text-accent-text " +
        "min-h-[96px] px-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      }
    >
      <span className="w-7 h-7 rounded-full bg-surface-elevated border border-subtle flex items-center justify-center group-hover:border-accent/[0.3]">
        <Plus size={13} />
      </span>
      <span className="text-[12px] font-medium">Add board</span>
      <span className="text-[10.5px] text-ink-faint text-center max-w-[200px] leading-tight">
        Save a JQL view for a project or release you are actively testing.
      </span>
    </button>
  );
}
