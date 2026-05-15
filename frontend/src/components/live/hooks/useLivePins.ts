/**
 * Phase 06 — durable Live pins hook.
 *
 * Replaces the localStorage-backed `usePinnedKeys`. Pins are persisted via
 * `/live/pins` (encrypted SQLite). The hook surfaces:
 *   - `keys` list of pinned ticket keys (preserving database order),
 *   - `pins` raw `LivePinnedTicket` rows (so callers can read snapshots),
 *   - `pin / unpin / toggle / isPinned` operations with optimistic updates,
 *   - `refresh()` to force a re-fetch.
 *
 * Optional `ticket_snapshot` lets callers persist a lightweight copy of the
 * ticket so the Pinned table can render without an immediate Jira fetch on
 * cold start.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { LivePinnedTicket } from "@/types/live";

export interface PinOptions {
  /** Optional board context. */
  boardId?: string | null;
  /** Optional ticket snapshot so the pinned table can render offline. */
  snapshot?: Record<string, unknown> | null;
}

export interface UseLivePinsResult {
  pins: LivePinnedTicket[];
  keys: string[];
  loading: boolean;
  error: string | null;
  isPinned: (key: string) => boolean;
  refresh: () => Promise<void>;
  pin: (key: string, opts?: PinOptions) => Promise<void>;
  unpin: (key: string) => Promise<void>;
  toggle: (key: string, opts?: PinOptions) => Promise<boolean>;
}

export function useLivePins(): UseLivePinsResult {
  const [pins, setPins] = useState<LivePinnedTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef<boolean>(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listLivePins();
      if (mounted.current) setPins(list);
    } catch (e: any) {
      if (mounted.current) setError(e?.message ?? "Failed to load pins");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const pin = useCallback(
    async (key: string, opts: PinOptions = {}) => {
      const trimmed = key.trim();
      if (!trimmed) return;
      // Optimistic insert at the top.
      const optimistic: LivePinnedTicket = {
        ticket_key: trimmed,
        board_id: opts.boardId ?? null,
        ticket_snapshot: opts.snapshot ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setPins((prev) => {
        if (prev.some((p) => p.ticket_key === trimmed)) return prev;
        return [optimistic, ...prev];
      });
      try {
        const saved = await api.putLivePin(trimmed, {
          board_id: opts.boardId ?? null,
          ticket_snapshot: opts.snapshot ?? null,
        });
        if (mounted.current) {
          setPins((prev) => {
            const without = prev.filter((p) => p.ticket_key !== trimmed);
            return [saved, ...without];
          });
        }
      } catch (e) {
        // Roll back the optimistic insert.
        if (mounted.current) {
          setPins((prev) => prev.filter((p) => p.ticket_key !== trimmed));
        }
        throw e;
      }
    },
    [],
  );

  const unpin = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    let snapshot: LivePinnedTicket | null = null;
    setPins((prev) => {
      const match = prev.find((p) => p.ticket_key === trimmed) ?? null;
      snapshot = match;
      return prev.filter((p) => p.ticket_key !== trimmed);
    });
    try {
      await api.deleteLivePin(trimmed);
    } catch (e) {
      // Restore on failure.
      if (mounted.current && snapshot) {
        setPins((prev) => [snapshot!, ...prev]);
      }
      throw e;
    }
  }, []);

  const toggle = useCallback(
    async (key: string, opts: PinOptions = {}): Promise<boolean> => {
      const trimmed = key.trim();
      if (!trimmed) return false;
      const isCurrentlyPinned = pins.some((p) => p.ticket_key === trimmed);
      if (isCurrentlyPinned) {
        await unpin(trimmed);
        return false;
      }
      await pin(trimmed, opts);
      return true;
    },
    [pins, pin, unpin],
  );

  const keys = useMemo(() => pins.map((p) => p.ticket_key), [pins]);

  const isPinned = useCallback(
    (key: string) => pins.some((p) => p.ticket_key === key),
    [pins],
  );

  return {
    pins,
    keys,
    loading,
    error,
    isPinned,
    refresh,
    pin,
    unpin,
    toggle,
  };
}
