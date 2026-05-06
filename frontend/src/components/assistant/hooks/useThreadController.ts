import { useCallback, useRef } from "react";
import * as api from "@/components/assistant/lib/api";
import type { Message } from "@/types/conversations";
import {
  useConversation,
  useConversationMutations,
} from "@/components/assistant/ConversationProvider";

export function useThreadController() {
  const conversation = useConversation();
  const { setStreaming, setLastWarnings } = useConversationMutations();
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, [setStreaming]);

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

      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      try {
        for await (const evt of api.streamAssistantReply(
          cid,
          controller.signal,
        )) {
          if (evt.error) throw new Error(evt.error);
          if (evt.text) conversation.appendStreamChunk(evt.text);
          if (evt.done) break;
        }
        const fresh = await api.getConversation(cid);
        const last = fresh.messages[fresh.messages.length - 1];
        if (last && last.role === "assistant") {
          conversation.finalizeAssistant(last);
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
    [conversation, setLastWarnings, setStreaming],
  );

  const regenerateLast = useCallback(async () => {
    const cid = conversation.conversationId;
    if (!cid || !conversation.current) return;
    const msgs = conversation.current.messages;
    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    await send("(regenerate previous response with fresh phrasing)");
  }, [conversation, send]);

  return { send, cancel, regenerateLast };
}

function truncateError(s: string | undefined): string {
  if (!s) return "Unknown error";
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
}
