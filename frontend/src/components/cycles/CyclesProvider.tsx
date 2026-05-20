import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "./lib/api";
import type {
  Cycle,
  CycleCreate,
  CyclePatch,
  CycleRun,
  CycleSummary,
} from "@/types/cycles";

interface ContextValue {
  cycles: CycleSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: CycleCreate) => Promise<Cycle>;
  update: (id: string, patch: CyclePatch) => Promise<Cycle>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Cycle>;
  togglePin: (id: string, next: boolean) => Promise<Cycle>;
  setArchived: (id: string, archived: boolean) => Promise<Cycle>;
  runCycle: (id: string, sessionName?: string) => Promise<CycleRun>;
  /** Most recently updated cycle (excluding archived) — used by `cycles.run-recent`. */
  mostRecent: () => CycleSummary | null;
}

const Ctx = createContext<ContextValue | null>(null);

function sortCycles(rows: CycleSummary[]): CycleSummary[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function summaryFromCycle(c: Cycle): CycleSummary {
  const {
    description: _d,
    ticketKeys: _tk,
    themes: _t,
    testCaseRefs: _r,
    createdAt: _ca,
    ...summary
  } = c;
  return summary;
}

export function CyclesProvider({ children }: { children: ReactNode }) {
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await api.listCycles();
      setCycles(sortCycles(next));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load cycles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback<ContextValue["create"]>(async (input) => {
    const created = await api.createCycle(input);
    setCycles((prev) => sortCycles([...prev, summaryFromCycle(created)]));
    return created;
  }, []);

  const update = useCallback<ContextValue["update"]>(async (id, patch) => {
    const updated = await api.patchCycle(id, patch);
    setCycles((prev) =>
      sortCycles(
        prev.map((c) => (c.id === id ? summaryFromCycle(updated) : c)),
      ),
    );
    return updated;
  }, []);

  const remove = useCallback<ContextValue["remove"]>(async (id) => {
    await api.deleteCycle(id);
    setCycles((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const duplicate = useCallback<ContextValue["duplicate"]>(async (id) => {
    const copy = await api.duplicateCycle(id);
    setCycles((prev) => sortCycles([...prev, summaryFromCycle(copy)]));
    return copy;
  }, []);

  const togglePin = useCallback<ContextValue["togglePin"]>(
    async (id, next) => update(id, { pinned: next }),
    [update],
  );

  const setArchived = useCallback<ContextValue["setArchived"]>(
    async (id, archived) => {
      const updated = await api.patchCycle(id, { archived });
      setCycles((prev) =>
        archived
          ? prev.filter((c) => c.id !== id)
          : sortCycles(
              prev.map((c) => (c.id === id ? summaryFromCycle(updated) : c)),
            ),
      );
      return updated;
    },
    [],
  );

  const runCycleAction = useCallback<ContextValue["runCycle"]>(
    async (id, sessionName) => {
      const run = await api.runCycle(id, sessionName ? { sessionName } : {});
      // Bump local row counters without a full refresh.
      setCycles((prev) =>
        sortCycles(
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  runCount: c.runCount + 1,
                  lastRunAt: run.startedAt,
                  updatedAt: run.startedAt,
                }
              : c,
          ),
        ),
      );
      return run;
    },
    [],
  );

  const mostRecent = useCallback((): CycleSummary | null => {
    const visible = cycles.filter((c) => !c.archived);
    return visible[0] ?? null;
  }, [cycles]);

  const value = useMemo<ContextValue>(
    () => ({
      cycles,
      loading,
      error,
      refresh,
      create,
      update,
      remove,
      duplicate,
      togglePin,
      setArchived,
      runCycle: runCycleAction,
      mostRecent,
    }),
    [
      cycles,
      loading,
      error,
      refresh,
      create,
      update,
      remove,
      duplicate,
      togglePin,
      setArchived,
      runCycleAction,
      mostRecent,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCycles(): ContextValue {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useCycles must be inside <CyclesProvider>");
  return ctx;
}
