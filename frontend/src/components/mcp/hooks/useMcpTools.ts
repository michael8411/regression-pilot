import { useEffect, useState } from "react";
import { useMcpConnections } from "../McpConnectionsProvider";
import type { McpTool } from "@/types/mcp";

export function useMcpTools(connectionId: string | null) {
  const { toolsFor } = useMcpConnections();
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connectionId) {
      setTools([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    toolsFor(connectionId)
      .then((rows) => {
        if (!cancelled) {
          setTools(rows);
          setError(null);
        }
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? "Failed to list tools");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId, toolsFor]);

  return { tools, loading, error };
}
