import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "@/lib/icons";
import { Button, Spinner } from "@/components/ui";
import { useMcpConnections } from "./McpConnectionsProvider";
import { McpToolRow } from "./McpToolRow";
import type { McpTool } from "@/types/mcp";

interface Props {
  connectionId: string;
  onClose: () => void;
}

export function McpToolListDrawer({ connectionId, onClose }: Props) {
  const { connections, toolsFor } = useMcpConnections();
  const conn = connections.find((c) => c.id === connectionId);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const next = await toolsFor(connectionId, force);
      setTools(next);
    } catch (e: any) {
      setError(e?.message ?? "Failed to list tools");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[8000] bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      aria-hidden
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Tools for ${conn?.name ?? connectionId}`}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 h-full w-[480px] max-w-[100vw] border-l border-subtle bg-surface-elevated shadow-float flex flex-col animate-slide-in-right"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-ink truncate">
              {conn?.name ?? "Tools"}
            </h2>
            <p className="text-[10.5px] text-ink-faint">
              {tools.length} {tools.length === 1 ? "tool" : "tools"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load(true)}
              disabled={loading}
              leading={
                loading ? <Spinner size={11} /> : <RefreshCw size={11} />
              }
            >
              Refresh
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-ink-muted hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-md border border-err/30 bg-err/10 px-2 py-1.5 text-[11.5px] text-err"
            >
              {error}
            </div>
          ) : tools.length === 0 ? (
            <p className="text-[12px] text-ink-muted">
              No tools exposed by this server.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tools.map((t) => (
                <McpToolRow key={t.name} tool={t} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
