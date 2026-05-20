/**
 * Phase 06 — durable Live activity feed hook.
 *
 * Backed by `/live/activity` (encrypted SQLite). The hook owns:
 *   - in-memory `events` cache (latest 100),
 *   - background refresh after writes,
 *   - `record(...)` API that emits intent-shaped events; failures NEVER
 *     break the user action — they are swallowed with a console warning.
 *
 * The hook is intentionally NOT a React Context — see `LiveActivityContext`
 * which wraps it so multiple consumers can share a single feed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { LiveActivityEvent } from "@/types/live";
import {
  backendKindForIntent,
  type ActivityIntent,
} from "./activityTypes";

const DEFAULT_LIMIT = 100;

export interface RecordActivityArgs {
  intent: ActivityIntent;
  summary: string;
  detail?: string;
  board_id?: string | null;
  ticket_key?: string | null;
}

export interface UseLiveActivityResult {
  events: LiveActivityEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /**
   * Fire-and-forget activity write. Resolves even when the write fails so
   * the user-visible action that triggered it never aborts.
   */
  record: (args: RecordActivityArgs) => Promise<void>;
  /** Clear the activity feed (used by "View history" → "Clear"). */
  clear: () => Promise<void>;
}

export function useLiveActivity(limit = DEFAULT_LIMIT): UseLiveActivityResult {
  const [events, setEvents] = useState<LiveActivityEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef<boolean>(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listLiveActivity({ limit });
      if (mounted.current) setEvents(list);
    } catch (e: any) {
      if (mounted.current) {
        setError(e?.message ?? "Failed to load activity");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const record = useCallback(
    async (args: RecordActivityArgs) => {
      try {
        const created = await api.createLiveActivity({
          kind: backendKindForIntent(args.intent),
          summary: args.summary,
          detail: args.detail ?? "",
          board_id: args.board_id ?? null,
          ticket_key: args.ticket_key ?? null,
        });
        // Optimistic prepend — refresh would also work, but skipping it
        // keeps the feed snappy for rapid-fire actions.
        if (mounted.current) {
          setEvents((prev) => [created, ...prev].slice(0, limit));
        }
      } catch (e) {
        // Activity write must never break the user action — log and continue.
        // eslint-disable-next-line no-console
        console.warn("live.activity.record failed", e);
      }
    },
    [limit],
  );

  const clear = useCallback(async () => {
    try {
      await api.clearLiveActivity();
      if (mounted.current) setEvents([]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("live.activity.clear failed", e);
    }
  }, []);

  return { events, loading, error, refresh, record, clear };
}
