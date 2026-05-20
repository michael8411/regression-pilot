import { useCallback } from "react";
import { invokeTool } from "@/components/mcp/lib/api";
import { useToolApprovals } from "./useToolApprovals";
import { useThreadController } from "./useThreadController";
import type { ToolCallPayload } from "@/types/conversations";

/**
 * Phase 9c: encapsulates the actual MCP call after the user (or
 * auto-approve) has approved a pending tool call. Records the resolved
 * payload via `useConversation.recordToolResult`, then re-streams so the
 * model can read the tool output and continue.
 */
export function useToolInvoker() {
  const { approve } = useToolApprovals();
  const { continueAfterTool } = useThreadController();

  const invoke = useCallback(
    async (call: ToolCallPayload): Promise<void> => {
      const start = performance.now();
      let resolved: ToolCallPayload;
      try {
        const res = await invokeTool(call.connection_id, call.tool, {
          requestId: call.request_id,
          input: call.input,
        });
        const duration_ms = Math.round(performance.now() - start);
        resolved = {
          ...call,
          status: res.ok ? "done" : "error",
          output: res.output,
          error: res.error,
          duration_ms,
        };
      } catch (e: any) {
        resolved = {
          ...call,
          status: "error",
          error: e?.message ?? "Unknown error",
          duration_ms: Math.round(performance.now() - start),
        };
      }

      const persisted = await approve(resolved);
      if (!persisted) return;

      // Continue the assistant turn so the model can read the tool result.
      await continueAfterTool();
    },
    [approve, continueAfterTool],
  );

  return { invoke };
}
