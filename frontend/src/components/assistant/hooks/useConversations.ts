import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "@/components/assistant/lib/api";
import type { Conversation } from "@/types/conversations";

export interface UseConversationsResult {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  includeArchived: boolean;

  setIncludeArchived: (b: boolean) => void;
  refresh: () => Promise<void>;

  create: (title?: string) => Promise<Conversation>;
  rename: (id: string, title: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  toggleArchive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listConversations(includeArchived);
      setConversations(list);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateLocal = useCallback(
    (id: string, patch: Partial<Conversation>) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const create = useCallback(async (title?: string) => {
    const created = await api.createConversation(title);
    setConversations((prev) => [created, ...prev]);
    return created;
  }, []);

  const rename = useCallback(
    async (id: string, title: string) => {
      const original = conversations.find((c) => c.id === id);
      updateLocal(id, { title });
      try {
        const updated = await api.patchConversation(id, { title });
        updateLocal(id, updated);
      } catch (e) {
        if (original) updateLocal(id, original);
        throw e;
      }
    },
    [conversations, updateLocal],
  );

  const togglePin = useCallback(
    async (id: string) => {
      const c = conversations.find((x) => x.id === id);
      if (!c) return;
      const next = !c.pinned;
      updateLocal(id, { pinned: next });
      try {
        await api.patchConversation(id, { pinned: next });
        setConversations((prev) =>
          [...prev].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.updated_at.localeCompare(a.updated_at);
          }),
        );
      } catch (e) {
        updateLocal(id, { pinned: c.pinned });
        throw e;
      }
    },
    [conversations, updateLocal],
  );

  const toggleArchive = useCallback(
    async (id: string) => {
      const c = conversations.find((x) => x.id === id);
      if (!c) return;
      const next = !c.archived;
      if (next && !includeArchived) {
        setConversations((prev) => prev.filter((x) => x.id !== id));
      } else {
        updateLocal(id, { archived: next });
      }
      try {
        await api.patchConversation(id, { archived: next });
      } catch (e) {
        void refresh();
        throw e;
      }
    },
    [conversations, includeArchived, refresh, updateLocal],
  );

  const remove = useCallback(
    async (id: string) => {
      const original = conversations;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      try {
        await api.deleteConversation(id);
      } catch (e) {
        setConversations(original);
        throw e;
      }
    },
    [conversations],
  );

  return useMemo(
    () => ({
      conversations,
      loading,
      error,
      includeArchived,
      setIncludeArchived,
      refresh,
      create,
      rename,
      togglePin,
      toggleArchive,
      remove,
    }),
    [
      conversations,
      loading,
      error,
      includeArchived,
      refresh,
      create,
      rename,
      togglePin,
      toggleArchive,
      remove,
    ],
  );
}
