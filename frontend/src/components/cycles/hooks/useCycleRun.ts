import { useCallback, useState } from "react";
import { useCycles } from "../CyclesProvider";
import { useRoute } from "@/contexts/RouteContext";
import type { CycleRun } from "@/types/cycles";

/**
 * Wraps `runCycle` with a busy state and post-run navigation. On success,
 * routes the user to `["regression","workbench"]` so the hydrated session
 * lands in the workbench. The session id is persisted by the backend; the
 * existing useSession.refreshActiveSession picks it up after navigation.
 */
export function useCycleRun() {
  const { runCycle } = useCycles();
  const { goto } = useRoute();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (cycleId: string, sessionName?: string): Promise<CycleRun | null> => {
      setBusy(true);
      setError(null);
      try {
        const result = await runCycle(cycleId, sessionName);
        goto(["regression", "workbench"]);
        return result;
      } catch (e: any) {
        setError(e?.message ?? "Failed to run cycle");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [goto, runCycle],
  );

  return { run, busy, error };
}
