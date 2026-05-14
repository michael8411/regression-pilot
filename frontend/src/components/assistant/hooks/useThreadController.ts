import { useCallback, useRef } from "react";
import * as api from "@/components/assistant/lib/api";
import type { Message, ToolCatalogEntry } from "@/types/conversations";
import {
  decodeToolRef,
} from "@/components/assistant/lib/attachmentUtils";
import {
  useConversation,
  useConversationMutations,
} from "@/components/assistant/ConversationProvider";

/**
 * Phase 9c: shared module-scoped cache of `${connection_id}:${tool}` →
 * description, populated by the Tools tab as the user attaches tools.
 * Used by `useThreadController` to enrich the streamed tool catalog without
 * a per-turn round-trip to MCP.
 *
 * Phase 4: also caches `inputSchema` so the assistant prompt can teach the
 * model the correct argument names/types up front.
 */
interface CachedToolMeta {
  description?: string;
  inputSchema?: Record<string, unknown> | null;
}

const toolDescriptionCache = new Map<string, CachedToolMeta>();

export function setToolDescription(
  connectionId: string,
  tool: string,
  description?: string,
  inputSchema?: Record<string, unknown> | null,
): void {
  if (!description && !inputSchema) return;
  const key = `${connectionId}:${tool}`;
  const prev = toolDescriptionCache.get(key) ?? {};
  toolDescriptionCache.set(key, {
    description: description ?? prev.description,
    inputSchema: inputSchema ?? prev.inputSchema,
  });
}

export function useThreadController() {
  const conversation = useConversation();
  const { setStreaming, setLastWarnings } = useConversationMutations();
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, [setStreaming]);

  const buildToolCatalog = useCallback((): ToolCatalogEntry[] => {
    const out: ToolCatalogEntry[] = [];
    for (const a of conversation.attachments) {
      if (a.kind !== "mcp_tool") continue;
      const ref = decodeToolRef(a.ref);
      if (!ref) continue;
      const cached =
        toolDescriptionCache.get(`${ref.connection_id}:${ref.tool}`);
      out.push({
        connection_id: ref.connection_id,
        tool: ref.tool,
        description: cached?.description,
        inputSchema: cached?.inputSchema ?? null,
      });
    }
    return out;
  }, [conversation.attachments]);

  const runStream = useCallback(
    async (placeholder: Message): Promise<void> => {
      const cid = conversation.conversationId;
      if (!cid) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      let toolCallSeen = false;
      try {
        for await (const evt of api.streamAssistantReply(
          cid,
          controller.signal,
          { tool_catalog: buildToolCatalog() },
        )) {
          if (evt.error) throw new Error(evt.error);
          if (evt.tool_call) {
            toolCallSeen = true;
            conversation.enqueueToolCall({
              ...evt.tool_call,
              status: "requested",
            });
            break;
          }
          if (evt.text) conversation.appendStreamChunk(evt.text);
          if (evt.done) break;
        }
        const fresh = await api.getConversation(cid);
        const last = fresh.messages[fresh.messages.length - 1];
        if (last && last.role === "assistant") {
          conversation.finalizeAssistant(last);
        } else if (toolCallSeen) {
          // Stream short-circuited on tool_call; the placeholder may be
          // empty. Finalize it with whatever we did stream so the bubble
          // doesn't render as an empty assistant turn forever.
          conversation.finalizeAssistant({
            ...placeholder,
            content: placeholder.content,
            meta: { ...placeholder.meta, tool_call_pending: true },
          });
        }
      } catch (e: any) {
        const aborted =
          e?.name === "AbortError" || controller.signal.aborted;
        conversation.finalizeAssistant({
          ...placeholder,
          content: aborted
            ? "_Stopped._"
            : `_Reply failed: ${truncateError(e?.message)}_`,
          meta: { error: !aborted, aborted },
        });
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [buildToolCatalog, conversation, setStreaming],
  );

  const send = useCallback(
    async (content: string) => {
      const cid = conversation.conversationId;
      if (!cid) throw new Error("No conversation selected");
      const trimmed = content.trim();
      if (!trimmed) return;

      const res = await api.appendMessage(cid, {
        role: "user",
        content: trimmed,
      });
      const userMessage: Message = res.message;
      if (res.secret_scan_warnings.length > 0) {
        setLastWarnings(res.secret_scan_warnings);
      } else {
        setLastWarnings([]);
      }
      conversation.appendMessage(userMessage);

      const placeholder: Message = {
        id: `pending-${Date.now()}`,
        conversation_id: cid,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
        meta: {},
      };
      conversation.appendMessage(placeholder);

      await runStream(placeholder);
    },
    [conversation, runStream, setLastWarnings],
  );

  /**
   * Continue an assistant turn after a tool result was recorded. The
   * conversation history already contains the new `tool` message; the
   * backend allows the next stream because the last message is `tool`.
   */
  const continueAfterTool = useCallback(async () => {
    const cid = conversation.conversationId;
    if (!cid) return;

    const placeholder: Message = {
      id: `pending-tool-${Date.now()}`,
      conversation_id: cid,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      meta: {},
    };
    conversation.appendMessage(placeholder);

    await runStream(placeholder);
  }, [conversation, runStream]);

  const regenerateLast = useCallback(async () => {
    const cid = conversation.conversationId;
    if (!cid || !conversation.current) return;
    const msgs = conversation.current.messages;
    const lastAssistant = [...msgs]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    await send("(regenerate previous response with fresh phrasing)");
  }, [conversation, send]);

  return { send, cancel, regenerateLast, continueAfterTool };
}

function truncateError(s: string | undefined): string {
  if (!s) return "Unknown error";
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
}
