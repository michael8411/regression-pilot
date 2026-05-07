import { Layers, Play } from "@/lib/icons";
import { Button, Spinner } from "@/components/ui";
import { useRoute } from "@/contexts/RouteContext";
import { CyclesProvider, useCycles } from "./CyclesProvider";
import { useCycleRun } from "./hooks/useCycleRun";

export function CyclesSummaryCard() {
  return (
    <CyclesProvider>
      <CyclesSummaryCardInner />
    </CyclesProvider>
  );
}

function CyclesSummaryCardInner() {
  const { cycles, loading } = useCycles();
  const { run, busy } = useCycleRun();
  const { goto } = useRoute();

  const visible = cycles.filter((c) => !c.archived).slice(0, 3);

  return (
    <section className="rounded-lg border border-subtle bg-surface-elevated p-4">
      <header className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-accent-text" />
          <h3 className="text-[13px] font-semibold text-ink">Test Cycles</h3>
        </div>
        <button
          type="button"
          onClick={() => goto(["regression", "cycles"])}
          className="text-[11px] text-accent-text hover:underline"
        >
          View all →
        </button>
      </header>
      {loading && cycles.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size={14} />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-[11.5px] text-ink-muted">
          Save your first cycle from a finished session.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-surface-overlay/40"
            >
              <button
                type="button"
                onClick={() => goto(["regression", "cycles"])}
                className="min-w-0 flex-1 text-left"
              >
                <div className="text-[12px] text-ink truncate">{c.name}</div>
                <div className="text-[10.5px] text-ink-faint truncate">
                  <span className="font-mono">{c.projectKey}</span>
                  {c.versionHint && <span> · {c.versionHint}</span>}
                  <span> · {c.ticketCount} tickets</span>
                  {c.runCount > 0 && <span> · run {c.runCount}×</span>}
                </div>
              </button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void run(c.id, c.name)}
                disabled={busy}
                leading={busy ? <Spinner size={11} /> : <Play size={11} />}
              >
                Run
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
