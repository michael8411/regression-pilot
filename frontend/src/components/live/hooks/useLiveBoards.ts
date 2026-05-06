import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { LiveBoard } from "@/types/live";

export interface UseLiveBoardsResult {
  boards: LiveBoard[];
  loading: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  create: (body: {
    name: string;
    jql: string;
    columns?: string[];
  }) => Promise<LiveBoard>;
  rename: (id: string, name: string) => Promise<void>;
  updateJql: (id: string, jql: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useLiveBoards(): UseLiveBoardsResult {
  const [boards, setBoards] = useState<LiveBoard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listLiveBoards();
      setBoards(list);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load boards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateLocal = useCallback(
    (id: string, patch: Partial<LiveBoard>) => {
      setBoards((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      );
    },
    [],
  );

  const create = useCallback(
    async (body: { name: string; jql: string; columns?: string[] }) => {
      const created = await api.createLiveBoard(body);
      setBoards((prev) => [created, ...prev]);
      return created;
    },
    [],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const original = boards.find((b) => b.id === id);
      updateLocal(id, { name });
      try {
        const updated = await api.patchLiveBoard(id, { name });
        updateLocal(id, updated);
      } catch (e) {
        if (original) updateLocal(id, original);
        throw e;
      }
    },
    [boards, updateLocal],
  );

  const updateJql = useCallback(
    async (id: string, jql: string) => {
      const original = boards.find((b) => b.id === id);
      updateLocal(id, { jql });
      try {
        const updated = await api.patchLiveBoard(id, { jql });
        updateLocal(id, updated);
      } catch (e) {
        if (original) updateLocal(id, original);
        throw e;
      }
    },
    [boards, updateLocal],
  );

  const togglePin = useCallback(
    async (id: string) => {
      const b = boards.find((x) => x.id === id);
      if (!b) return;
      const next = !b.pinned;
      updateLocal(id, { pinned: next });
      try {
        await api.patchLiveBoard(id, { pinned: next });
        setBoards((prev) =>
          [...prev].sort((a, c) => {
            if (a.pinned !== c.pinned) return a.pinned ? -1 : 1;
            return c.updated_at.localeCompare(a.updated_at);
          }),
        );
      } catch (e) {
        updateLocal(id, { pinned: b.pinned });
        throw e;
      }
    },
    [boards, updateLocal],
  );

  const remove = useCallback(
    async (id: string) => {
      const original = boards;
      setBoards((prev) => prev.filter((b) => b.id !== id));
      try {
        await api.deleteLiveBoard(id);
      } catch (e) {
        setBoards(original);
        throw e;
      }
    },
    [boards],
  );

  return useMemo(
    () => ({
      boards,
      loading,
      error,
      refresh,
      create,
      rename,
      updateJql,
      togglePin,
      remove,
    }),
    [
      boards,
      loading,
      error,
      refresh,
      create,
      rename,
      updateJql,
      togglePin,
      remove,
    ],
  );
}
