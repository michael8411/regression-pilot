import { useCallback } from "react";
import { useConversation } from "@/components/assistant/ConversationProvider";
import { useMcpConnections } from "@/components/mcp";

export function useToolApprovals() {
  const { pendingToolCalls, recordToolResult, denyToolCall } =
    useConversation();
  const { connections } = useMcpConnections();

  const isAutoApproved = useCallback(
    (connectionId: string, tool: string): boolean => {
      const conn = connections.find((c) => c.id === connectionId);
      return conn?.autoApprove.includes(tool) === true;
    },
    [connections],
  );

  const isConnectionEnabled = useCallback(
    (connectionId: string): boolean => {
      const conn = connections.find((c) => c.id === connectionId);
      return conn?.enabled === true;
    },
    [connections],
  );

  return {
    pending: pendingToolCalls,
    approve: recordToolResult,
    deny: denyToolCall,
    isAutoApproved,
    isConnectionEnabled,
  };
}
