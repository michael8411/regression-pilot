import { useCallback, useEffect, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { JiraTicket } from "@/types";

export interface UseTicketDetailResult {
  ticket: JiraTicket | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Optimistic: append a comment locally without refetch. */
  addLocalComment: (c: {
    author: string;
    created: string;
    body: string;
  }) => void;
}

export function useTicketDetail(key: string | null): UseTicketDetailResult {
  const [ticket, setTicket] = useState<JiraTicket | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!key) {
      setTicket(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await api.fetchTicketsByKeys([key]);
      setTicket(list[0] ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addLocalComment = useCallback(
    (c: { author: string; created: string; body: string }) => {
      setTicket((prev) =>
        prev ? { ...prev, comments: [...prev.comments, c] } : prev,
      );
    },
    [],
  );

  return { ticket, loading, error, refresh, addLocalComment };
}
