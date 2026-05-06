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
import { useBoardTickets } from "./hooks/useBoardTickets";
import type { LiveBoard } from "@/types/live";
import type { JiraTicket } from "@/types";

export interface BoardContextValue {
  board: LiveBoard | null;
  tickets: JiraTicket[];
  byStatus: Record<string, JiraTicket[]>;
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Move a ticket to a target status column. Throws on failure. */
  transition: (ticketKey: string, toStatus: string) => Promise<void>;
  /** Pause polling (drag in progress / drawer open). Stacks. */
  pausePolling: () => void;
  resumePolling: () => void;
  /** Optimistically move a ticket between columns. Returns a rollback fn. */
  optimisticMove: (
    ticketKey: string,
    fromStatus: string,
    toStatus: string,
  ) => () => void;
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

  useEffect(() => {
    let cancelled = false;
    if (!boardId) {
      setBoard(null);
      return;
    }
    (async () => {
      try {
        const b = await api.getLiveBoard(boardId);
        if (!cancelled) setBoard(b);
      } catch {
        if (!cancelled) setBoard(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const { response, loading, error, refresh, pause, resume } = useBoardTickets(
    board?.jql ?? null,
  );

  const [optimistic, setOptimistic] = useState<Record<string, string>>({});

  const byStatus = useMemo(() => {
    const base = response?.by_status ?? {};
    if (Object.keys(optimistic).length === 0) return base;
    const next: Record<string, JiraTicket[]> = {};
    for (const [status, tickets] of Object.entries(base)) {
      next[status] = tickets.filter((t) => !optimistic[t.key]);
    }
    for (const [, tickets] of Object.entries(base)) {
      for (const t of tickets) {
        const target = optimistic[t.key];
        if (!target) continue;
        next[target] = next[target] ?? [];
        next[target].push({ ...t, status: target });
      }
    }
    return next;
  }, [response, optimistic]);

  const tickets = useMemo(() => Object.values(byStatus).flat(), [byStatus]);

  const optimisticMove = useCallback(
    (ticketKey: string, _fromStatus: string, toStatus: string) => {
      setOptimistic((prev) => ({ ...prev, [ticketKey]: toStatus }));
      return () => {
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[ticketKey];
          return next;
        });
      };
    },
    [],
  );

  const transition = useCallback(
    async (ticketKey: string, toStatus: string) => {
      const transitions = await api.listJiraTransitions(ticketKey);
      const match = transitions.find((t) => t.to.name === toStatus);
      if (!match) {
        throw new Error(`No transition to "${toStatus}"`);
      }
      const result = await api.doJiraTransition(ticketKey, match.id);
      if (!result.ok) throw new Error("Transition failed");
      await refresh();
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[ticketKey];
        return next;
      });
    },
    [refresh],
  );

  const value = useMemo<BoardContextValue>(
    () => ({
      board,
      tickets,
      byStatus,
      fetchedAt: response?.fetched_at ?? null,
      loading,
      error,
      refresh,
      transition,
      pausePolling: pause,
      resumePolling: resume,
      optimisticMove,
    }),
    [
      board,
      tickets,
      byStatus,
      response,
      loading,
      error,
      refresh,
      transition,
      pause,
      resume,
      optimisticMove,
    ],
  );

  return (
    <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be inside <BoardProvider>");
  return ctx;
}
