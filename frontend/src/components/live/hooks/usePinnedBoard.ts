/**
 * Phase 06 — pinned board hook backed by `/live/pins` + Jira hydration.
 *
 * Strategy:
 *   1. The durable pin list comes from `useLivePins()` (encrypted SQLite).
 *   2. We hydrate the `JiraTicket` payload by calling
 *      `fetchTicketsByKeys(keys)`. While that call is in flight, any
 *      `ticket_snapshot` blobs from the database fill in the table so the
 *      Pinned page never renders empty for already-known pins.
 *   3. Unpin re-uses `useLivePins`' `unpin()` (single source of truth).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { JiraTicket } from "@/types";
import { useLivePins } from "./useLivePins";

function snapshotToTicket(snap: Record<string, unknown> | null | undefined): JiraTicket | null {
  if (!snap || typeof snap !== "object") return null;
  // Trust the encrypted snapshot's shape — backend round-trips it from
  // earlier saves. Anything missing falls back to an empty default so the
  // table still renders.
  return {
    key: typeof snap.key === "string" ? snap.key : "",
    id: typeof snap.id === "string" ? snap.id : "",
    summary: typeof snap.summary === "string" ? snap.summary : "",
    status: typeof snap.status === "string" ? snap.status : "",
    issue_type: typeof snap.issue_type === "string" ? snap.issue_type : "",
    priority: typeof snap.priority === "string" ? snap.priority : "",
    assignee: typeof snap.assignee === "string" ? snap.assignee : "",
    reporter: typeof snap.reporter === "string" ? snap.reporter : "",
    labels: Array.isArray(snap.labels)
      ? (snap.labels as string[]).filter((l) => typeof l === "string")
      : [],
    components: Array.isArray(snap.components)
      ? (snap.components as string[]).filter((c) => typeof c === "string")
      : [],
    fix_versions: Array.isArray(snap.fix_versions)
      ? (snap.fix_versions as string[]).filter((v) => typeof v === "string")
      : [],
    resolution: typeof snap.resolution === "string" ? snap.resolution : "",
    created: typeof snap.created === "string" ? snap.created : "",
    updated: typeof snap.updated === "string" ? snap.updated : "",
    description: typeof snap.description === "string" ? snap.description : "",
    comments: [],
  };
}

export function usePinnedBoard() {
  const { pins, keys, unpin } = useLivePins();
  const [tickets, setTickets] = useState<JiraTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef<boolean>(true);

  const cacheKey = keys.join("|");

  // Seed table with snapshots so the empty-state never flashes for pinned rows.
  useEffect(() => {
    const snapshots = pins
      .map((p) => snapshotToTicket(p.ticket_snapshot))
      .filter((t): t is JiraTicket => !!t && Boolean(t.key));
    if (snapshots.length > 0) {
      setTickets((prev) => {
        // Merge: prefer existing live tickets when present, otherwise add snapshot.
        const byKey = new Map<string, JiraTicket>(
          prev.map((t) => [t.key, t]),
        );
        for (const s of snapshots) {
          if (!byKey.has(s.key)) byKey.set(s.key, s);
        }
        return [...byKey.values()];
      });
    }
  }, [pins]);

  const refresh = useCallback(async () => {
    if (keys.length === 0) {
      setTickets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await api.fetchTicketsByKeys(keys);
      if (mounted.current) setTickets(list);
    } catch (e: any) {
      if (mounted.current) {
        setError(e?.message ?? "Failed to load pinned tickets");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // When a pin is removed, drop it from the displayed list immediately so the
  // table empties even if a stale hydration response arrives later.
  const visibleKeys = useMemo(() => new Set(keys), [keys]);
  const filteredTickets = useMemo(
    () => tickets.filter((t) => visibleKeys.has(t.key)),
    [tickets, visibleKeys],
  );

  return {
    tickets: filteredTickets,
    loading,
    error,
    refresh,
    unpin: (key: string) => void unpin(key).catch(() => undefined),
  };
}
