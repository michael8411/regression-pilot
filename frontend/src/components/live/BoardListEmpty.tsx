import { Layers, Plus } from "@/lib/icons";

interface Props {
  onNew: () => void;
}

/**
 * Phase 02: lives inside the new dashboard scroll area; padding is
 * slimmed (was `px-6 py-16`) so the empty state sits beneath the stats
 * strip + filter row without an awkward gap. Behavior unchanged.
 */
export function BoardListEmpty({ onNew }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center rounded-xl border border-dashed border-muted bg-surface-overlay/30">
      <div className="w-12 h-12 rounded-xl bg-accent-dim border border-accent/[0.15] flex items-center justify-center mb-4">
        <Layers size={18} className="text-accent-text" />
      </div>
      <h3 className="text-[14px] font-semibold text-ink mb-1">
        No boards yet
      </h3>
      <p className="text-[12px] text-ink-muted max-w-sm leading-relaxed">
        Boards are saved JQL queries. Create one for the project / version you
        are actively testing.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-4 g-btn-solid text-[12px] px-3 py-1.5 inline-flex items-center gap-1.5"
      >
        <Plus size={11} />
        Create your first board
      </button>
    </div>
  );
}
