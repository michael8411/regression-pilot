import { useCallback, useEffect, useState } from "react";
import * as api from "@/components/live/lib/api";
import { usePinnedKeys } from "./usePinnedKeys";
import type { JiraTicket } from "@/types";

export function usePinnedBoard() {
  const { keys, unpin } = usePinnedKeys();
  const [tickets, setTickets] = useState<JiraTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = keys.join("|");

  const refresh = useCallback(async () => {
    if (keys.length === 0) {
      setTickets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await api.fetchTicketsByKeys(keys);
      setTickets(list);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load pinned tickets");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tickets, loading, error, refresh, unpin };
}
