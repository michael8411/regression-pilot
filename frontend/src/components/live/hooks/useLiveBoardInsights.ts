/**
 * Phase 04 — per-board analytics hook.
 *
 * Fetches `BoardResponse` via `fetchBoardTickets` and derives `LiveBoardInsights`
 * using `buildBoardInsights`. Key behaviors:
 *
 * - In-memory cache keyed by `board.id`, TTL 90 s.
 * - Max concurrent requests = 3 (semaphore pattern).
 * - Stale-while-refresh: cached value is returned immediately; background
 *   refresh runs when TTL has expired, suppressing card flicker.
 * - On error: null insights (card renders "Data unavailable" fallback).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveBoard, LiveBoardInsights } from "@/types/live";
import { fetchBoardTickets } from "@/components/live/lib/api";
import { buildBoardInsights } from "@/components/live/lib/boardInsights";

const CACHE_TTL_MS = 90_000;
const MAX_CONCURRENT = 3;

interface CacheEntry {
  insights: LiveBoardInsights;
  fetchedAt: number;
}

// Module-level cache shared across hook instances (avoids duplicate fetches
// when multiple boards are visible simultaneously).
const insightCache = new Map<string, CacheEntry>();
let inflight = 0;
const queue: Array<() => void> = [];

function acquireSemaphore(): Promise<void> {
  if (inflight < MAX_CONCURRENT) {
    inflight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function releaseSemaphore() {
  const next = queue.shift();
  if (next) {
    next();
  } else {
    inflight = Math.max(0, inflight - 1);
  }
}

export interface BoardInsightsState {
  insights: LiveBoardInsights | null;
  loading: boolean;
  error: string | null;
}

/**
 * Returns insights for a single board. Re-fetches automatically when the
 * board's JQL changes or the cache TTL expires.
 */
export function useLiveBoardInsights(
  board: LiveBoard | null | undefined,
): BoardInsightsState {
  const [state, setState] = useState<BoardInsightsState>({
    insights: null,
    loading: true,
    error: null,
  });

  // Track the board id+jql combo so we refetch if it changes.
  const keyRef = useRef<string>("");

  const fetch = useCallback(
    async (boardId: string, jql: string, serveStale: boolean) => {
      const cached = insightCache.get(boardId);
      if (cached) {
        const age = Date.now() - cached.fetchedAt;
        if (age < CACHE_TTL_MS) {
          setState({ insights: cached.insights, loading: false, error: null });
          return;
        }
        if (serveStale) {
          // Return stale while re-fetching in the background.
          setState({ insights: cached.insights, loading: false, error: null });
        }
      }

      if (!serveStale) {
        setState((s) => ({ ...s, loading: true, error: null }));
      }

      await acquireSemaphore();
      try {
        const response = await fetchBoardTickets(jql);
        const insights = buildBoardInsights(response, {
          qaStatusOverride: undefined, // Phase 05 will thread board profile overrides
        });
        insightCache.set(boardId, { insights, fetchedAt: Date.now() });
        setState({ insights, loading: false, error: null });
      } catch (e: any) {
        setState((prev) => ({
          insights: prev.insights,       // keep stale data if available
          loading: false,
          error: e?.message ?? "Insights unavailable",
        }));
      } finally {
        releaseSemaphore();
      }
    },
    [],
  );

  useEffect(() => {
    if (!board) {
      setState({ insights: null, loading: false, error: null });
      return;
    }

    const key = `${board.id}|${board.jql}`;
    const isNew = keyRef.current !== key;
    keyRef.current = key;

    void fetch(board.id, board.jql, !isNew);
  }, [board, fetch]);

  return state;
}
