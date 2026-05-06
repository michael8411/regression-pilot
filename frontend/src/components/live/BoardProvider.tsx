import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "@/components/live/lib/api";
import type { BoardResponse, LiveBoard } from "@/types/live";
import type { JiraTicket } from "@/types";

export interface BoardContextValue {
  board: LiveBoard | null;
  tickets: JiraTicket[];
  byStatus: Record<string, JiraTicket[]>;
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** No-op stub — 8c replaces. */
  transition: (key: string, toStatus: string) => Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({
  boardId,
  children,
}: {
  boardId: string | null;
  children: ReactNode;
}) {
  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [response, setResponse] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!boardId) {
      setBoard(null);
      setResponse(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const b = await api.getLiveBoard(boardId);
      setBoard(b);
      const r = await api.fetchBoardTickets(b.jql);
      setResponse(r);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load board");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const transition = useCallback(async (_k: string, _t: string) => {
    // Replaced in 8c
  }, []);

  const value = useMemo<BoardContextValue>(() => {
    const byStatus = response?.by_status ?? {};
    const tickets = Object.values(byStatus).flat();
    return {
      board,
      tickets,
      byStatus,
      fetchedAt: response?.fetched_at ?? null,
      loading,
      error,
      refresh,
      transition,
    };
  }, [board, response, loading, error, refresh, transition]);

  return (
    <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be inside <BoardProvider>");
  return ctx;
}
