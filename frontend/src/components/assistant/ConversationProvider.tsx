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
import * as api from "@/components/assistant/lib/api";
import type {
  Attachment,
  ConversationWithMessages,
  Message,
  SecretScanWarning,
  ToolCallPayload,
} from "@/types/conversations";

export interface ConversationContextValue {
  current: ConversationWithMessages | null;
  conversationId: string | null;
  loading: boolean;
  error: string | null;
  /** True while waiting for the assistant's reply. */
  streaming: boolean;
  /** Most recent secret-scan warnings from a save. UI may surface and clear. */
  lastWarnings: SecretScanWarning[];
  /** Tool calls that arrived as `tool_call` events and haven't been resolved. */
  pendingToolCalls: ToolCallPayload[];
  refresh: () => Promise<void>;
  appendMessage: (m: Message) => void;
  appendStreamChunk: (chunk: string) => void;
  finalizeAssistant: (final: Message) => void;
  clearWarnings: () => void;
  /** Phase 9c: queue an inbound tool_call from the SSE stream. */
  enqueueToolCall: (call: ToolCallPayload) => void;
  /** Phase 9c: persist a resolved tool result + clear from pending queue. */
  recordToolResult: (payload: ToolCallPayload) => Promise<Message | null>;
  /** Phase 9c: explicit deny shortcut. */
  denyToolCall: (
    requestId: string,
    options?: { reason?: string },
  ) => Promise<Message | null>;
  attachments: Attachment[];
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

interface ConversationMutationsValue {
  setStreaming: (b: boolean) => void;
  setLastWarnings: (w: SecretScanWarning[]) => void;
}

const ConversationMutationsContext =
  createContext<ConversationMutationsValue | null>(null);

export function ConversationProvider({
  conversationId,
  children,
}: {
  conversationId: string | null;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState<ConversationWithMessages | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<boolean>(false);
  const [lastWarnings, setLastWarnings] = useState<SecretScanWarning[]>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCallPayload[]>(
    [],
  );

  const lastConvoIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!conversationId) {
      setCurrent(null);
      lastConvoIdRef.current = null;
      return;
    }
    if (lastConvoIdRef.current !== conversationId) {
      setCurrent(null);
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getConversation(conversationId);
      setCurrent(data);
      lastConvoIdRef.current = conversationId;
    } catch (e: any) {
      setError(e?.message ?? "Failed to load conversation");
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const appendMessage = useCallback((m: Message) => {
    setCurrent((prev) => {
      if (!prev || prev.conversation.id !== m.conversation_id) return prev;
      return { ...prev, messages: [...prev.messages, m] };
    });
  }, []);

  const appendStreamChunk = useCallback((chunk: string) => {
    setCurrent((prev) => {
      if (!prev) return prev;
      const msgs = prev.messages;
      if (msgs.length === 0 || msgs[msgs.length - 1].role !== "assistant") {
        return prev;
      }
      const updated = [...msgs];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = { ...last, content: last.content + chunk };
      return { ...prev, messages: updated };
    });
  }, []);

  const finalizeAssistant = useCallback((final: Message) => {
    setCurrent((prev) => {
      if (!prev) return prev;
      const msgs = prev.messages;
      if (msgs.length === 0) return prev;
      const idx = msgs.length - 1;
      if (msgs[idx].role !== "assistant") return prev;
      const updated = [...msgs];
      updated[idx] = final;
      return { ...prev, messages: updated };
    });
  }, []);

  const clearWarnings = useCallback(() => setLastWarnings([]), []);

  // Reset pending tool calls when the conversation changes.
  useEffect(() => {
    setPendingToolCalls([]);
  }, [conversationId]);

  const enqueueToolCall = useCallback((call: ToolCallPayload) => {
    setPendingToolCalls((prev) => {
      if (prev.some((p) => p.request_id === call.request_id)) return prev;
      return [...prev, call];
    });
  }, []);

  const recordToolResult = useCallback(
    async (payload: ToolCallPayload): Promise<Message | null> => {
      if (!conversationId) return null;
      const msg = await api.recordToolMessage(conversationId, payload);
      // Append the tool message into the local thread and clear the pending entry.
      setCurrent((prev) => {
        if (!prev || prev.conversation.id !== conversationId) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
      setPendingToolCalls((prev) =>
        prev.filter((p) => p.request_id !== payload.request_id),
      );
      return msg;
    },
    [conversationId],
  );

  const denyToolCall = useCallback(
    async (
      requestId: string,
      _options?: { reason?: string },
    ): Promise<Message | null> => {
      const call = pendingToolCalls.find((p) => p.request_id === requestId);
      if (!call) return null;
      return recordToolResult({
        ...call,
        status: "denied",
      });
    },
    [pendingToolCalls, recordToolResult],
  );

  const value = useMemo<ConversationContextValue>(
    () => ({
      current,
      conversationId,
      loading,
      error,
      streaming,
      lastWarnings,
      pendingToolCalls,
      refresh,
      appendMessage,
      appendStreamChunk,
      finalizeAssistant,
      clearWarnings,
      enqueueToolCall,
      recordToolResult,
      denyToolCall,
      attachments: current?.attachments ?? [],
    }),
    [
      current,
      conversationId,
      loading,
      error,
      streaming,
      lastWarnings,
      pendingToolCalls,
      refresh,
      appendMessage,
      appendStreamChunk,
      finalizeAssistant,
      clearWarnings,
      enqueueToolCall,
      recordToolResult,
      denyToolCall,
    ],
  );

  const mutations = useMemo<ConversationMutationsValue>(
    () => ({ setStreaming, setLastWarnings }),
    [],
  );

  return (
    <ConversationContext.Provider value={value}>
      <ConversationMutationsContext.Provider value={mutations}>
        {children}
      </ConversationMutationsContext.Provider>
    </ConversationContext.Provider>
  );
}

export function useConversation(): ConversationContextValue {
  const ctx = useContext(ConversationContext);
  if (!ctx)
    throw new Error("useConversation must be inside <ConversationProvider>");
  return ctx;
}

export function useConversationMutations(): ConversationMutationsValue {
  const ctx = useContext(ConversationMutationsContext);
  if (!ctx) {
    throw new Error(
      "useConversationMutations must be inside <ConversationProvider>",
    );
  }
  return ctx;
}
