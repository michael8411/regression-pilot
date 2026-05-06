import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "@/components/assistant/lib/api";
import type {
  Attachment,
  ConversationWithMessages,
  Message,
} from "@/types/conversations";

export interface ConversationContextValue {
  current: ConversationWithMessages | null;
  conversationId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** No-op stubs — real implementations land in 7c. */
  appendMessage: (m: Message) => void;
  appendStreamChunk: (chunk: string) => void;
  finalizeAssistant: (final: Message) => void;
  attachments: Attachment[];
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

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

  const refresh = useCallback(async () => {
    if (!conversationId) {
      setCurrent(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getConversation(conversationId);
      setCurrent(data);
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

  // Stubs — 7c replaces these
  const appendMessage = useCallback((_m: Message) => {}, []);
  const appendStreamChunk = useCallback((_c: string) => {}, []);
  const finalizeAssistant = useCallback((_m: Message) => {}, []);

  const value = useMemo<ConversationContextValue>(
    () => ({
      current,
      conversationId,
      loading,
      error,
      refresh,
      appendMessage,
      appendStreamChunk,
      finalizeAssistant,
      attachments: current?.attachments ?? [],
    }),
    [
      current,
      conversationId,
      loading,
      error,
      refresh,
      appendMessage,
      appendStreamChunk,
      finalizeAssistant,
    ],
  );

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation(): ConversationContextValue {
  const ctx = useContext(ConversationContext);
  if (!ctx)
    throw new Error("useConversation must be inside <ConversationProvider>");
  return ctx;
}
