import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "@/lib/icons";
import { Button, Spinner } from "@/components/ui";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import {
  McpConnectionsProvider,
  useMcpConnections,
} from "./McpConnectionsProvider";
import { McpConnectionList } from "./McpConnectionList";
import { McpConnectionDialog } from "./McpConnectionDialog";
import { McpTestResultModal } from "./McpTestResultModal";
import { McpToolListDrawer } from "./McpToolListDrawer";
import { McpEmptyState } from "./McpEmptyState";
import { consumePendingOpen, subscribe } from "./panelBus";
import type { McpConnection, McpTestResult } from "@/types/mcp";

export function McpConnectionsPanel() {
  return (
    <McpConnectionsProvider>
      <McpConnectionsPanelInner />
    </McpConnectionsProvider>
  );
}

function McpConnectionsPanelInner() {
  const { connections, loading, error, refresh } = useMcpConnections();

  const [editing, setEditing] = useState<McpConnection | null>(null);
  const [creating, setCreating] = useState(false);
  const [testResult, setTestResult] = useState<{
    name: string;
    result: McpTestResult;
  } | null>(null);
  const [toolsForId, setToolsForId] = useState<string | null>(null);

  // Honor a pending request from the palette to immediately open the dialog.
  useEffect(() => {
    if (consumePendingOpen()) {
      setCreating(true);
    }
    return subscribe(() => setCreating(true));
  }, []);

  // Register the per-mount refresh command.
  const refreshCommand = useMemo<CommandItem>(
    () => ({
      id: "mcp.refresh",
      group: "action",
      label: "MCP: Refresh connections",
      sub: "MCP",
      icon: RefreshCw,
      keywords: ["mcp", "refresh", "reload"],
      action: { type: "run", run: () => void refresh() },
    }),
    [refresh],
  );
  useRegisterCommand(refreshCommand);

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[860px] mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">
            Model Context Protocol
          </h2>
          <p className="text-[12px] text-ink-muted">
            Connect external tool servers your assistant can call into.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
            leading={
              loading ? <Spinner size={11} /> : <RefreshCw size={11} />
            }
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreating(true)}
            leading={<Plus size={12} />}
          >
            Add connection
          </Button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-err/30 bg-err/10 px-3 py-2 text-[12px] text-err"
        >
          {error}
        </div>
      )}

      {!loading && connections.length === 0 && !error ? (
        <McpEmptyState onCreate={() => setCreating(true)} />
      ) : (
        <McpConnectionList
          connections={connections}
          loading={loading}
          onEdit={setEditing}
          onTest={(name, result) => setTestResult({ name, result })}
          onShowTools={setToolsForId}
        />
      )}

      {creating && (
        <McpConnectionDialog
          mode="create"
          onClose={() => setCreating(false)}
        />
      )}

      {editing && (
        <McpConnectionDialog
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {testResult && (
        <McpTestResultModal
          name={testResult.name}
          result={testResult.result}
          onClose={() => setTestResult(null)}
        />
      )}

      {toolsForId && (
        <McpToolListDrawer
          connectionId={toolsForId}
          onClose={() => setToolsForId(null)}
        />
      )}
    </div>
  );
}
