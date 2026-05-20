import { AlertTriangle, CheckCircle2, Loader2, Play } from "@/lib/icons";
import { summarizeStatuses, type PreviewState } from "./useBoardPreview";
import { classifyStatus } from "@/components/live/lib/statusTaxonomy";

interface Props {
  state: PreviewState;
  effectiveJql: string;
  onRun: () => void;
  laneGrouping: "none" | "epic" | "parent" | "component";
}

export function BuilderPreviewPanel({
  state,
  effectiveJql,
  onRun,
  laneGrouping,
}: Props) {
  const runDisabled = state.kind === "loading" || effectiveJql.trim().length === 0;
  return (
    <section className="rounded-md border border-subtle bg-surface-elevated">
      <header className="flex items-center justify-between px-3 py-2 border-b border-subtle">
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-semibold text-ink">Preview</span>
          {state.kind === "ok" && (
            <span className="text-[10.5px] text-ok flex items-center gap-1">
              <CheckCircle2 size={11} /> {state.response.total} ticket
              {state.response.total === 1 ? "" : "s"}
            </span>
          )}
          {state.kind === "error" && (
            <span className="text-[10.5px] text-err flex items-center gap-1">
              <AlertTriangle size={11} /> preview failed
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={runDisabled}
          className="g-btn text-[11.5px] px-2 py-1 flex items-center gap-1.5 disabled:opacity-50"
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
          <p className="text-[11.5px] text-ink-muted">
            Run a preview to validate the JQL and see which statuses Jira
            returns. Save is enabled after a successful preview.
          </p>
        )}
        {state.kind === "loading" && (
          <p className="text-[11.5px] text-ink-muted">Querying Jira…</p>
        )}
        {state.kind === "error" && (
          <p className="text-[11.5px] text-err break-words">{state.error}</p>
        )}
        {state.kind === "ok" && (
          <PreviewBody state={state} laneGrouping={laneGrouping} />
        )}
      </div>
    </section>
  );
}

function PreviewBody({
  state,
  laneGrouping,
}: {
  state: Extract<PreviewState, { kind: "ok" }>;
  laneGrouping: "none" | "epic" | "parent" | "component";
}) {
  const rows = summarizeStatuses(state.response);
  if (rows.length === 0) {
    return (
      <p className="text-[11.5px] text-ink-muted">
        Preview returned 0 tickets. Adjust statuses, version, or assignee
        scope and try again.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="grid grid-cols-2 gap-1.5">
        {rows.map((r) => {
          const bucket = classifyStatus(r.name);
          return (
            <li
              key={r.name}
              className="flex items-center justify-between gap-2 rounded-md border border-subtle bg-surface-overlay px-2 py-1"
            >
              <span className="text-[11.5px] text-ink truncate">{r.name}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span
                  className="text-[10px] uppercase tracking-wider text-ink-faint"
                  title={`QA bucket: ${bucket}`}
                >
                  {bucket === "other" ? "skip" : bucket}
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  {r.count}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {laneGrouping !== "none" && (
        <p className="text-[10.5px] text-ink-faint">
          Lane grouping <span className="font-mono">{laneGrouping}</span> will
          be applied client-side when the board opens.
        </p>
      )}
    </div>
  );
}
