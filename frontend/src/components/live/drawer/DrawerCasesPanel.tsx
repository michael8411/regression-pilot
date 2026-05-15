/**
 * Phase 05 — drawer Test Cases panel.
 *
 * Phase 06 will wire the persisted Live generated-case drafts. For now
 * we render an explicit empty state with a hint pointing users to the AI
 * tab. Closing/reopening the drawer must NOT crash if no drafts source
 * exists yet, so this panel reads no external state.
 */

import { ListChecks, Sparkles } from "@/lib/icons";

interface Props {
  /** Callback to switch the drawer to the AI tab. */
  onGoToAi: () => void;
}

export function DrawerCasesPanel({ onGoToAi }: Props) {
  return (
    <div
      id="drawer-panel-cases"
      role="tabpanel"
      aria-labelledby="drawer-tab-cases"
      className="px-4 py-8 flex flex-col items-center justify-center text-center"
    >
      <div className="w-10 h-10 rounded-lg bg-surface-overlay border border-subtle flex items-center justify-center mb-3">
        <ListChecks size={16} className="text-ink-muted" />
      </div>
      <p className="text-[12px] text-ink-secondary font-medium mb-1">
        No saved test cases yet
      </p>
      <p className="text-[11.5px] text-ink-faint max-w-[300px] leading-relaxed mb-3">
        Generated test cases will appear here once persistence is wired.
        Use the AI tab to draft cases for this ticket.
      </p>
      <button
        type="button"
        onClick={onGoToAi}
        className="g-btn text-[11.5px] px-2.5 py-1.5 inline-flex items-center gap-1.5 text-ai hover:text-ai"
      >
        <Sparkles size={11} />
        Open AI tab
      </button>
    </div>
  );
}
