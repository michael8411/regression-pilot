import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { BoardResponse } from "@/types/live";

const POLL_MS = 45_000;

export interface UseBoardTicketsResult {
  response: BoardResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  pause: () => void;
  resume: () => void;
}

export function useBoardTickets(jql: string | null): UseBoardTicketsResult {
  const [response, setResponse] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const pausedRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!jql) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.fetchBoardTickets(jql);
      setResponse(r);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [jql]);

  const scheduleNext = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      if (pausedRef.current === 0 && !document.hidden) {
        void refresh();
      }
      scheduleNext();
    }, POLL_MS);
  }, [refresh]);

  useEffect(() => {
    if (!jql) return;
    void refresh();
    scheduleNext();
    const onVisibility = () => {
      if (!document.hidden && pausedRef.current === 0) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [jql, refresh, scheduleNext]);

  const pause = useCallback(() => {
    pausedRef.current += 1;
  }, []);
  const resume = useCallback(() => {
    pausedRef.current = Math.max(0, pausedRef.current - 1);
  }, []);

  return { response, loading, error, refresh, pause, resume };
}
