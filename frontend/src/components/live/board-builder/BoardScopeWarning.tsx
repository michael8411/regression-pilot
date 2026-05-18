import { AlertTriangle } from "@/lib/icons";
import type { PreviewState } from "./useBoardPreview";

interface Props {
  previewState: PreviewState;
  jql: string;
  /** True when the JQL has a focusing filter beyond project (version, component, etc.). */
  hasNarrowingFilter: boolean;
  onGroupByEpic: () => void;
}

const BROAD_TICKET_THRESHOLD = 50;
const BROAD_EPIC_THRESHOLD = 3;

function distinctEpicCount(state: PreviewState): number {
  if (state.kind !== "ok") return 0;
  const epics = new Set<string>();
  for (const tickets of Object.values(state.response.by_status)) {
    for (const t of tickets) {
      const key = t.epic_key || t.parent_key || "";
      if (key) epics.add(key);
    }
  }
  return epics.size;
}

export function BoardScopeWarning({
  previewState,
  jql,
  hasNarrowingFilter,
  onGroupByEpic,
}: Props) {
  const ok = previewState.kind === "ok" ? previewState : null;
  const ticketCount = ok?.response.total ?? 0;
  const epicCount = distinctEpicCount(previewState);
  const jqlMissingProject = !/project\s*=/i.test(jql);

  const broad =
    (ok && ticketCount > BROAD_TICKET_THRESHOLD) ||
    (ok && epicCount > BROAD_EPIC_THRESHOLD) ||
    jqlMissingProject ||
    (!hasNarrowingFilter && jql.trim().length > 0);

  if (!broad) return null;

  return (
    <section className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 flex items-start gap-2">
      <AlertTriangle size={12} className="text-warn shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-ink-secondary leading-snug">
          This board is broad. Pick a version, component, or epic so QA can
          read it at a glance. Broad boards default to grouping by epic.
        </p>
        <button
          type="button"
          onClick={onGroupByEpic}
          className="mt-1.5 g-btn text-[11px] px-2 py-1"
        >
          Group by epic
        </button>
      </div>
    </section>
  );
}
