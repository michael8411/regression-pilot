import { useCallback, useEffect, useState } from "react";
import { backendFetch } from "@/lib/backendAuth";

const ROOT =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "http://127.0.0.1:8000";

export type ManagedProviderState =
  | "connected"
  | "needs_setup"
  | "not_configured"
  | "error";

export interface ManagedProviderStatus {
  provider: string;
  connection_id: string;
  configured: boolean;
  state: ManagedProviderState;
  auto_approve: string[];
}

interface StatusResponse {
  providers: Record<string, ManagedProviderStatus>;
}

/**
 * Phase 18 — pulls the managed MCP provider status for the Assistant
 * status bar / managed tools panel. The backend is authoritative for
 * the catalog; this hook only renders availability state.
 */
export function useAssistantToolCatalog() {
  const [providers, setProviders] = useState<ManagedProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backendFetch(`${ROOT}/mcp/assistant/status`);
      if (!res.ok) {
        throw new Error(`status failed: ${res.status}`);
      }
      const data: StatusResponse = await res.json();
      setProviders(Object.values(data.providers || {}));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "unknown error");
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { providers, loading, error, refresh };
}
