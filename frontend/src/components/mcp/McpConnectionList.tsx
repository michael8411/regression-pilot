import { McpConnectionRow } from "./McpConnectionRow";
import type { McpConnection, McpTestResult } from "@/types/mcp";

interface Props {
  connections: McpConnection[];
  loading: boolean;
  onEdit: (c: McpConnection) => void;
  onTest: (name: string, result: McpTestResult) => void;
  onShowTools: (id: string) => void;
}

export function McpConnectionList({
  connections,
  loading,
  onEdit,
  onTest,
  onShowTools,
}: Props) {
  if (loading && connections.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg bg-surface-overlay/50"
          />
        ))}
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {connections.map((c) => (
        <McpConnectionRow
          key={c.id}
          connection={c}
          onEdit={() => onEdit(c)}
          onTest={(result) => onTest(c.name, result)}
          onShowTools={() => onShowTools(c.id)}
        />
      ))}
    </ul>
  );
}
