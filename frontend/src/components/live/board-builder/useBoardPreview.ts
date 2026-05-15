import { useCallback, useState } from "react";
import { fetchBoardTickets } from "@/components/live/lib/api";
import type { BoardResponse } from "@/types/live";

export type PreviewState =
  | { kind: "idle" }
  | { kind: "loading"; jql: string }
  | { kind: "ok"; jql: string; response: BoardResponse; fetchedAt: number }
  | { kind: "error"; jql: string; error: string };

/**
 * Phase 03 — preview hook for the board builder.
 *
 * Calls the existing Jira passthrough (`/jira/board`) and surfaces the
 * normalized `BoardResponse` so the structure-mapping step can show the
 * detected status set + counts. The hook is intentionally minimal: the
 * caller drives "run preview" via `run(jql)`; we keep a single state slot
 * so dialog consumers can render preview status inline.
 */
export function useBoardPreview() {
  const [state, setState] = useState<PreviewState>({ kind: "idle" });

  const run = useCallback(async (jql: string) => {
    const trimmed = (jql || "").trim();
    if (!trimmed) {
      setState({ kind: "error", jql: trimmed, error: "JQL is empty" });
      return;
    }
    setState({ kind: "loading", jql: trimmed });
    try {
      const response = await fetchBoardTickets(trimmed);
      setState({
        kind: "ok",
        jql: trimmed,
        response,
        fetchedAt: Date.now(),
      });
    } catch (e: any) {
      setState({
        kind: "error",
        jql: trimmed,
        error: e?.message ?? "Preview failed",
      });
    }
  }, []);

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, run, reset };
}

/** Status names + counts derived from a `BoardResponse`, sorted by count desc. */
export function summarizeStatuses(
  response: BoardResponse | null | undefined,
): { name: string; count: number }[] {
  if (!response || !response.by_status) return [];
  const rows: { name: string; count: number }[] = [];
  for (const [name, tickets] of Object.entries(response.by_status)) {
    rows.push({
      name,
      count: Array.isArray(tickets) ? tickets.length : 0,
    });
  }
  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return rows;
}
