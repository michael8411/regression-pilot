/**
 * Phase 06 — thin compatibility wrapper around `useLivePins`.
 *
 * The original implementation owned a localStorage-backed pin list, but the
 * durable source is now `/live/pins` (encrypted SQLite). Keeping this hook
 * alive as a thin adapter avoids a wide rename across drawer/card/table
 * consumers while still routing everything through the new API.
 *
 * NOTE: localStorage IS NO LONGER read or written here. Any pin state that
 * existed in `live.pinned-keys` is ignored and effectively discarded; the
 * source of truth is the database.
 */

import { useLivePins } from "./useLivePins";

export function usePinnedKeys() {
  const { keys, pin, unpin, toggle, isPinned } = useLivePins();

  return {
    keys,
    pin: (key: string) => void pin(key).catch(() => undefined),
    unpin: (key: string) => void unpin(key).catch(() => undefined),
    toggle: (key: string) => void toggle(key).catch(() => undefined),
    isPinned,
  };
}
