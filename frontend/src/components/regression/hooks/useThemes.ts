import { useCallback, useEffect, useMemo, useState } from "react";
import { groupTickets } from "@/lib/api";
import type { JiraTicket, TicketGroup } from "@/types";
import { useRegressionSession } from "./useRegressionSession";

export type ThemeMap = Record<string, JiraTicket[]>;

export interface UseThemesResult {
  themes: ThemeMap;
  loading: boolean;
  error: string | null;
  regroup: () => Promise<void>;
  setThemes: (next: ThemeMap) => void;
  renameColumn: (oldName: string, newName: string) => void;
  removeColumn: (name: string) => void;
  addColumn: (name: string) => void;
  moveTicket: (key: string, toColumn: string, toIndex: number) => void;
  /** True on first load if we restored a valid grouping that covers the current tickets. */
  isCachedFromSession: boolean;
}

const NEEDS_REVIEW = "Needs Review";

/**
 * Encapsulates the AI grouping + manual edit logic for the ThemeEditor.
 *
 * Cost-control rule: never re-run the AI grouping if the restored
 * `editableGroups` already covers exactly the current ticket keys. The
 * `isCachedFromSession` flag is the single source of truth for that
 * decision; both the auto-load effect and the cache-hit indicator read it.
 */
export function useThemes(tickets: JiraTicket[]): UseThemesResult {
  const { state, saveState, saveStateImmediate } = useRegressionSession();

  // Stable signature of the current ticket set (sorted, joined keys).
  const ticketSig = useMemo(
    () => tickets.map((t) => t.key).sort().join("|"),
    [tickets],
  );

  // Stable signature of the keys present in the restored grouping.
  const restoredSig = useMemo(() => {
    const groups = state.editableGroups;
    if (!groups) return null;
    const keys: string[] = [];
    for (const arr of Object.values(groups)) {
      if (!Array.isArray(arr)) continue;
      for (const t of arr) keys.push(t.key);
    }
    if (keys.length === 0) return null;
    return keys.sort().join("|");
  }, [state.editableGroups]);

  const isCachedFromSession =
    restoredSig !== null && restoredSig === ticketSig;

  const [themes, setThemesInternal] = useState<ThemeMap>(() =>
    isCachedFromSession ? (state.editableGroups as ThemeMap) : {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save through the debounced channel for user-initiated edits.
  const setThemes = useCallback(
    (next: ThemeMap) => {
      setThemesInternal(next);
      saveState("editableGroups", next);
    },
    [saveState],
  );

  // Build a ThemeMap from the AI's group response, attaching full ticket
  // objects and pooling any orphan tickets into "Needs Review".
  const ticketsToMap = useCallback(
    (groups: TicketGroup[]): ThemeMap => {
      const byKey = new Map(tickets.map((t) => [t.key, t]));
      const map: ThemeMap = {};
      const seen = new Set<string>();
      for (const g of groups) {
        const items = g.ticket_keys
          .map((k) => byKey.get(k))
          .filter((t): t is JiraTicket => Boolean(t));
        map[g.name] = items;
        for (const t of items) seen.add(t.key);
      }
      const orphans = tickets.filter((t) => !seen.has(t.key));
      if (orphans.length > 0) {
        map[NEEDS_REVIEW] = [...(map[NEEDS_REVIEW] ?? []), ...orphans];
      }
      return map;
    },
    [tickets],
  );

  const runGrouping = useCallback(async () => {
    if (tickets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await groupTickets(tickets);
      const map = ticketsToMap(result.groups);
      setThemesInternal(map);
      // Critical write — bypass the debounce so a crash mid-drag doesn't
      // lose AI work the user just paid for.
      await saveStateImmediate("editableGroups", map);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Failed to group tickets";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tickets, ticketsToMap, saveStateImmediate]);

  // Auto-run grouping only when the cache doesn't cover the current tickets.
  useEffect(() => {
    if (isCachedFromSession) return;
    if (tickets.length === 0) return;
    void runGrouping();
    // We intentionally re-run only when the ticket set or cache flag changes —
    // not on every runGrouping closure rebuild. runGrouping closes over the
    // latest tickets after each render, so by the time this effect fires it
    // already references the freshest data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketSig, isCachedFromSession]);

  // ── Column / ticket mutation helpers ──────────────────────────
  const renameColumn = useCallback(
    (oldName: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || oldName === trimmed) return;
      // Refuse collisions — including renaming TO "Needs Review" if it exists.
      if (themes[trimmed] !== undefined) return;
      // Don't rename FROM "Needs Review" either; the AI prompt references it
      // by name and it carries semantic meaning.
      if (oldName === NEEDS_REVIEW) return;
      const next: ThemeMap = {};
      for (const [k, v] of Object.entries(themes)) {
        next[k === oldName ? trimmed : k] = v;
      }
      setThemes(next);
    },
    [themes, setThemes],
  );

  const removeColumn = useCallback(
    (name: string) => {
      if (name === NEEDS_REVIEW) return;
      const tx = themes[name] ?? [];
      const next = { ...themes };
      delete next[name];
      if (tx.length > 0) {
        // Don't drop tickets silently — pool them into Needs Review.
        next[NEEDS_REVIEW] = [...(next[NEEDS_REVIEW] ?? []), ...tx];
      }
      setThemes(next);
    },
    [themes, setThemes],
  );

  const addColumn = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || themes[trimmed] !== undefined) return;
      setThemes({ ...themes, [trimmed]: [] });
    },
    [themes, setThemes],
  );

  const moveTicket = useCallback(
    (key: string, toColumn: string, toIndex: number) => {
      const next: ThemeMap = {};
      let moved: JiraTicket | null = null;
      for (const [col, list] of Object.entries(themes)) {
        const filtered: JiraTicket[] = [];
        for (const t of list) {
          if (t.key === key) moved = t;
          else filtered.push(t);
        }
        next[col] = filtered;
      }
      if (!moved) return;
      if (next[toColumn] === undefined) next[toColumn] = [];
      const insertAt = Math.max(
        0,
        Math.min(toIndex, next[toColumn].length),
      );
      next[toColumn].splice(insertAt, 0, moved);
      setThemes(next);
    },
    [themes, setThemes],
  );

  return {
    themes,
    loading,
    error,
    regroup: runGrouping,
    setThemes,
    renameColumn,
    removeColumn,
    addColumn,
    moveTicket,
    isCachedFromSession,
  };
}
