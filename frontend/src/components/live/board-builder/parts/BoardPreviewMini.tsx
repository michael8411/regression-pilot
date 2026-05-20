import { useMemo } from "react";
import { CheckCircle2, Loader2, Play } from "@/lib/icons";
import { StatusDot } from "@/components/live/visual";
import { resolveBoardColumns } from "@/components/live/board/lib/columnVisibility";
import {
  summarizeStatuses,
  type PreviewState,
} from "../useBoardPreview";

interface Props {
  state: PreviewState;
  effectiveJql: string;
  onRun: () => void;
  selectedStatuses: ReadonlyArray<string>;
}

export function BoardPreviewMini({
  state,
  effectiveJql,
  onRun,
  selectedStatuses,
}: Props) {
  const runDisabled =
    state.kind === "loading" || effectiveJql.trim().length === 0;
  const summaryRows =
    state.kind === "ok" ? summarizeStatuses(state.response) : [];

  const resolvedColumns = useMemo(() => {
    if (state.kind !== "ok") return [];
    return resolveBoardColumns({
      jiraColumns: [...selectedStatuses],
      byStatus: state.response.by_status,
      mode: "qa",
      showEmptyNonQa: false,
    });
  }, [state, selectedStatuses]);

  return (
    <section className="rounded-md border border-subtle bg-surface-elevated">
      <header className="flex items-center justify-between px-3 py-2 border-b border-subtle">
        <span className="text-[11.5px] font-semibold text-ink">Preview</span>
        <button
          type="button"
          onClick={onRun}
          disabled={runDisabled}
          className="g-btn text-[11px] px-2 py-1 flex items-center gap-1.5 disabled:opacity-50"
        >
          {state.kind === "loading" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Play size={11} />
          )}
          Run preview
        </button>
      </header>
      <div className="px-3 py-2">
        {state.kind === "idle" && (
          <p className="text-[11px] text-ink-faint">
            Run a preview to validate the JQL and see what your board will
            look like.
          </p>
        )}
        {state.kind === "loading" && (
          <p className="text-[11px] text-ink-faint">Querying Jira…</p>
        )}
        {state.kind === "error" && (
          <p className="text-[11px] text-err break-words">{state.error}</p>
        )}
        {state.kind === "ok" && (
          <div className="flex flex-col gap-2">
            <p className="text-[10.5px] text-ok flex items-center gap-1">
              <CheckCircle2 size={11} /> {state.response.total} ticket
              {state.response.total === 1 ? "" : "s"}
            </p>
            {resolvedColumns.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {resolvedColumns.map((c) => (
                  <span
                    key={c.status}
                    className="inline-flex items-center gap-1 rounded-md border border-subtle bg-surface-overlay/40 px-1.5 py-0.5 text-[10.5px] text-ink"
                  >
                    <StatusDot tone={c.bucket} />
                    <span className="truncate max-w-[120px]" title={c.status}>
                      {c.status}
                    </span>
                    <span className="font-mono text-ink-faint">{c.count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10.5px] text-ink-faint">
                No QA-bucketed columns. Add Ready / Testing statuses or open
                Advanced to map them.
              </p>
            )}
            {summaryRows.length === 0 && (
              <p className="text-[10.5px] text-ink-faint">
                Preview returned 0 tickets. Adjust scope and try again.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
