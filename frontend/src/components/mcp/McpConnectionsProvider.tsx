import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "./lib/api";
import type { McpConnection, McpTestResult, McpTool } from "@/types/mcp";

interface ContextValue {
  connections: McpConnection[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (
    input: Parameters<typeof api.createConnection>[0],
  ) => Promise<McpConnection>;
  update: (
    id: string,
    patch: Parameters<typeof api.patchConnection>[1],
  ) => Promise<McpConnection>;
  remove: (id: string) => Promise<void>;
  test: (id: string) => Promise<McpTestResult>;
  toolsFor: (id: string, refresh?: boolean) => Promise<McpTool[]>;
}

const Ctx = createContext<ContextValue | null>(null);

function sortConnections(rows: McpConnection[]): McpConnection[] {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function McpConnectionsProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toolsCache = useRef<
    Map<string, { fetchedAt: number; tools: McpTool[] }>
  >(new Map());

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await api.listConnections();
      setConnections(sortConnections(next));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback<ContextValue["create"]>(async (input) => {
    const created = await api.createConnection(input);
    setConnections((prev) => sortConnections([...prev, created]));
    return created;
  }, []);

  const update = useCallback<ContextValue["update"]>(async (id, patch) => {
    const updated = await api.patchConnection(id, patch);
    setConnections((prev) =>
      sortConnections(prev.map((c) => (c.id === id ? updated : c))),
    );
    toolsCache.current.delete(id);
    return updated;
  }, []);

  const remove = useCallback<ContextValue["remove"]>(async (id) => {
    await api.deleteConnection(id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
    toolsCache.current.delete(id);
  }, []);

  const test = useCallback<ContextValue["test"]>(async (id) => {
    return api.testConnection(id);
  }, []);

  const toolsFor = useCallback<ContextValue["toolsFor"]>(
    async (id, force = false) => {
      const cached = toolsCache.current.get(id);
      if (!force && cached && Date.now() - cached.fetchedAt < 60_000) {
        return cached.tools;
      }
      const fresh = await api.listTools(id, force);
      toolsCache.current.set(id, { fetchedAt: Date.now(), tools: fresh });
      return fresh;
    },
    [],
  );

  const value = useMemo<ContextValue>(
    () => ({
      connections,
      loading,
      error,
      refresh,
      create,
      update,
      remove,
      test,
      toolsFor,
    }),
    [
      connections,
      loading,
      error,
      refresh,
      create,
      update,
      remove,
      test,
      toolsFor,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMcpConnections(): ContextValue {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error(
      "useMcpConnections must be inside <McpConnectionsProvider>",
    );
  return ctx;
}
