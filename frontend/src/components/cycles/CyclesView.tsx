import { useEffect, useMemo, useState } from "react";
import { Layers, Play, Plus } from "@/lib/icons";
import { Button, Spinner } from "@/components/ui";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import { CyclesProvider, useCycles } from "./CyclesProvider";
import { CycleCard } from "./CycleCard";
import { CycleBuilderDialog } from "./CycleBuilderDialog";
import { CycleRunHistoryDrawer } from "./CycleRunHistoryDrawer";
import { useCycleRun } from "./hooks/useCycleRun";
import { consumePendingPrefill, subscribe } from "./cycleBus";
import type { CycleCreate, CycleSummary } from "@/types/cycles";

export function CyclesView() {
  return (
    <CyclesProvider>
      <CyclesViewInner />
    </CyclesProvider>
  );
}

function CyclesViewInner() {
  const { cycles, loading, error, refresh, mostRecent } = useCycles();
  const { run, busy: runBusy } = useCycleRun();

  const [creating, setCreating] = useState<{ prefill?: CycleCreate } | null>(
    null,
  );
  const [editing, setEditing] = useState<CycleSummary | null>(null);
  const [historyFor, setHistoryFor] = useState<CycleSummary | null>(null);

  // Open the builder if the workbench / palette requested one before mount.
  useEffect(() => {
    const pending = consumePendingPrefill();
    if (pending) {
      setCreating({ prefill: pending });
    }
    return subscribe(() => {
      const next = consumePendingPrefill();
      if (next) setCreating({ prefill: next });
    });
  }, []);

  // Palette command: run most recent cycle.
  const recent = mostRecent();
  const runRecentCommand = useMemo<CommandItem>(
    () => ({
      id: "cycles.run-recent",
      group: "action",
      label: "Cycles: Run last test cycle",
      sub: "Cycles",
      icon: Play,
      keywords: ["cycle", "run", "last", "recent"],
      action: {
        type: "run",
        run: () => {
          if (recent) void run(recent.id, recent.name);
        },
      },
    }),
    [recent, run],
  );
  useRegisterCommand(runRecentCommand);

  // Palette command: new cycle.
  const newCommand = useMemo<CommandItem>(
    () => ({
      id: "cycles.new",
      group: "action",
      label: "Cycles: New test cycle…",
      sub: "Cycles",
      icon: Plus,
      keywords: ["cycle", "new", "create"],
      action: {
        type: "run",
        run: () => setCreating({}),
      },
    }),
    [],
  );
  useRegisterCommand(newCommand);

  const pinned = cycles.filter((c) => c.pinned && !c.archived);
  const others = cycles.filter((c) => !c.pinned && !c.archived);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="flex items-center justify-between px-6 py-4 border-b border-subtle">
        <div>
          <h1 className="text-[16px] font-semibold text-ink">Test Cycles</h1>
          <p className="text-[11.5px] text-ink-muted">
            Reusable regression blueprints. Save, version, replay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!recent || runBusy}
            onClick={() => recent && void run(recent.id, recent.name)}
            leading={runBusy ? <Spinner size={11} /> : <Play size={11} />}
          >
            Run last
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreating({})}
            leading={<Plus size={12} />}
          >
            New cycle
          </Button>
        </div>
      </header>

      <div className="flex-1 px-6 py-4">
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-err/30 bg-err/10 px-3 py-2 text-[12px] text-err"
          >
            {error}
            <button
              type="button"
              onClick={() => void refresh()}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )}

        {loading && cycles.length === 0 ? (
          <ul className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="h-16 animate-pulse rounded-lg bg-surface-overlay/50"
              />
            ))}
          </ul>
        ) : cycles.length === 0 ? (
          <CyclesEmptyState onCreate={() => setCreating({})} />
        ) : (
          <div className="flex flex-col gap-4 max-w-[860px]">
            {pinned.length > 0 && (
              <Section label="Pinned">
                <ul className="flex flex-col gap-2">
                  {pinned.map((c) => (
                    <CycleCard
                      key={c.id}
                      cycle={c}
                      onEdit={setEditing}
                      onShowHistory={setHistoryFor}
                    />
                  ))}
                </ul>
              </Section>
            )}
            {others.length > 0 && (
              <Section label={pinned.length > 0 ? "All cycles" : "Cycles"}>
                <ul className="flex flex-col gap-2">
                  {others.map((c) => (
                    <CycleCard
                      key={c.id}
                      cycle={c}
                      onEdit={setEditing}
                      onShowHistory={setHistoryFor}
                    />
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>

      {creating && (
        <CycleBuilderDialog
          mode="create"
          prefill={creating.prefill}
          onClose={() => setCreating(null)}
        />
      )}
      {editing && (
        <CycleBuilderDialog
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {historyFor && (
        <CycleRunHistoryDrawer
          cycleId={historyFor.id}
          cycleName={historyFor.name}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold">
        {label}
      </h2>
      {children}
    </section>
  );
}

function CyclesEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-subtle p-10 text-center">
      <Layers size={28} className="text-ink-muted" />
      <h3 className="text-[14px] font-semibold text-ink">No cycles yet</h3>
      <p className="max-w-sm text-[11.5px] text-ink-muted leading-relaxed">
        Save a list of tickets and themes as a reusable blueprint. Run it
        next month to spin up a fresh session pre-populated with the same
        scope.
      </p>
      <Button
        variant="primary"
        size="sm"
        onClick={onCreate}
        leading={<Plus size={12} />}
      >
        Create your first cycle
      </Button>
    </div>
  );
}
