import { useCallback, useEffect, useState } from "react";
import type {
  CoreConnectionsStatus,
  CoreServiceId,
} from "@/types/coreConnections";
import {
  disconnectService,
  getCoreConnectionsStatus,
} from "../lib/coreConnectionsApi";

const EMPTY: CoreConnectionsStatus = {
  jira: { configured: false, base_url: null, email: null },
  github: { configured: false },
  ado: { configured: false, org: null },
  gemini: { configured: false },
  zephyr: { configured: false },
  sql_server: { configured: false, database: null, schema_allowlist: null, include_procs: false },
};

export function useCoreConnections() {
  const [status, setStatus] = useState<CoreConnectionsStatus>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getCoreConnectionsStatus();
      setStatus(s);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load connection status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disconnect = useCallback(
    async (service: CoreServiceId | "gemini" | "zephyr") => {
      await disconnectService(service);
      await refresh();
    },
    [refresh],
  );

  return { status, loading, error, refresh, disconnect };
}
