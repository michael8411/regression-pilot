import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "@/components/live/lib/api";
import { useBoardTickets } from "./hooks/useBoardTickets";
import { resolveAutoLaneGrouping } from "./board/lib/laneGrouping";
import { defaultViewPrefs } from "./board-builder/lib/defaultBoardProfile";
import { deriveWorkflowColumnOrder } from "./board-builder/lib/deriveWorkflowColumnOrder";
import type { LiveBoard } from "@/types/live";
import type { JiraTicket } from "@/types";

export interface BoardSummary {
  total: number;
  distinctEpics: number;
  distinctComponents: number;
}

export interface BoardContextValue {
  board: LiveBoard | null;
  tickets: JiraTicket[];
  byStatus: Record<string, JiraTicket[]>;
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
  summary: BoardSummary;
  refresh: () => Promise<void>;
  /** Move a ticket to a target status column. Throws on failure. */
  transition: (ticketKey: string, toStatus: string) => Promise<void>;
  /** Pause polling (drag in progress / drawer open). Stacks. */
  pausePolling: () => void;
  resumePolling: () => void;
  /** Optimistically move a ticket between columns. Returns a rollback fn. */
  optimisticMove: (
    ticketKey: string,
    fromStatus: string,
    toStatus: string,
  ) => () => void;
}

function computeSummary(tickets: JiraTicket[]): BoardSummary {
  const epics = new Set<string>();
  const comps = new Set<string>();
  for (const t of tickets) {
    const e = t.epic_key || t.parent_key || "";
    if (e) epics.add(e);
    const c = t.component_name || t.components?.[0] || "";
    if (c) comps.add(c);
  }
  return {
    total: tickets.length,
    distinctEpics: epics.size,
    distinctComponents: comps.size,
  };
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({
  boardId,
  children,
}: {
  boardId: string | null;
  children: ReactNode;
}) {
  const [board, setBoard] = useState<LiveBoard | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!boardId) {
      setBoard(null);
      return;
    }
    (async () => {
      try {
        const b = await api.getLiveBoard(boardId);
        if (!cancelled) setBoard(b);
      } catch {
        if (!cancelled) setBoard(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const { response, loading, error, refresh, pause, resume } = useBoardTickets(
    board?.jql ?? null,
  );

  const [optimistic, setOptimistic] = useState<Record<string, string>>({});

  const byStatus = useMemo(() => {
    const base = response?.by_status ?? {};
    if (Object.keys(optimistic).length === 0) return base;
    const next: Record<string, JiraTicket[]> = {};
    for (const [status, tickets] of Object.entries(base)) {
      next[status] = tickets.filter((t) => !optimistic[t.key]);
    }
    for (const [, tickets] of Object.entries(base)) {
      for (const t of tickets) {
        const target = optimistic[t.key];
        if (!target) continue;
        next[target] = next[target] ?? [];
        next[target].push({ ...t, status: target });
      }
    }
    return next;
  }, [response, optimistic]);

  const tickets = useMemo(() => Object.values(byStatus).flat(), [byStatus]);

  const summary = useMemo(() => computeSummary(tickets), [tickets]);

  // One-shot auto-lane resolution. When a board has no persisted lane
  // grouping (legacy) or the profile is missing entirely, infer from the
  // first non-empty fetch and write the resolution back so the choice is
  // stable across reloads. User-picked values are never overwritten.
  const autoResolvedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!board || !response) return;
    if (autoResolvedRef.current === board.id) return;
    const profile = board.profile;
    const alreadyResolved = !!profile?.laneGrouping;
    if (alreadyResolved) {
      autoResolvedRef.current = board.id;
      return;
    }
    const ticketsAtFetch = Object.values(response.by_status).flat();
    if (ticketsAtFetch.length === 0) return;
    const resolved = resolveAutoLaneGrouping(ticketsAtFetch);
    autoResolvedRef.current = board.id;
    const nextProfile = {
      ...(profile ?? {
        builderMode: "simple",
        projectKey: "",
        versionName: "",
        selectedStatuses: [],
        qaStatusMap: { ready: [], testing: [], done: [] },
        assigneeScope: "anyone",
        refreshIntervalSec: 60,
        customJql: board.jql,
      }),
      laneGrouping: resolved,
    } as LiveBoard["profile"];
    void api
      .patchLiveBoard(board.id, {
        profile: nextProfile ?? undefined,
        view_prefs: board.view_prefs ?? defaultViewPrefs(),
      })
      .then((updated) => setBoard(updated))
      .catch(() => undefined);
  }, [board, response]);

  // Layer 1 PR2 — one-shot legacy hydrate of `workflowColumnOrder`.
  //
  // Existing boards saved before PR1 have empty workflowColumnOrder. Without
  // it, the resolver falls back to `board.columns` which may be just the QA
  // subset (3 statuses) saved by the old builder. We fetch the project's
  // full status list, derive the L→R order, then persist it once so future
  // loads use the saved value directly.
  const hydratedColumnsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!board) return;
    if (hydratedColumnsRef.current === board.id) return;
    const profile = board.profile;
    // Already hydrated — skip.
    if (profile?.workflowColumnOrder && profile.workflowColumnOrder.length > 0) {
      hydratedColumnsRef.current = board.id;
      return;
    }
    // No project key on profile → nothing to fetch.
    const projectKey = profile?.projectKey?.trim();
    if (!projectKey) {
      hydratedColumnsRef.current = board.id;
      return;
    }
    hydratedColumnsRef.current = board.id;
    let cancelled = false;
    (async () => {
      try {
        const resp = await api.getJiraProjectStatuses(projectKey);
        if (cancelled) return;
        const statuses = resp.statuses.map((s) => ({
          name: s.name,
          category: s.category,
          issueTypes: s.issue_types ?? [],
        }));
        const order = deriveWorkflowColumnOrder(
          statuses,
          resp.workflow_column_order,
        );
        if (order.length === 0) return;
        const nextProfile = {
          ...(profile ?? {
            builderMode: "simple" as const,
            projectKey,
            versionName: "",
            selectedStatuses: [],
            qaStatusMap: { ready: [], testing: [], done: [] },
            laneGrouping: "none" as const,
            assigneeScope: "anyone" as const,
            refreshIntervalSec: 60,
            customJql: board.jql,
          }),
          workflowColumnOrder: order,
        };
        // Mirror to top-level `columns` so legacy readers that still go
        // through `board.columns` see the same order.
        const updated = await api.patchLiveBoard(board.id, {
          profile: nextProfile,
          columns: order,
        });
        if (!cancelled) setBoard(updated);
      } catch {
        // Hydration is best-effort. If the Jira fetch fails the board still
        // renders via `board.columns`; we'll try again on next mount.
        hydratedColumnsRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [board]);

  const optimisticMove = useCallback(
    (ticketKey: string, _fromStatus: string, toStatus: string) => {
      setOptimistic((prev) => ({ ...prev, [ticketKey]: toStatus }));
      return () => {
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[ticketKey];
          return next;
        });
      };
    },
    [],
  );

  const transition = useCallback(
    async (ticketKey: string, toStatus: string) => {
      const transitions = await api.listJiraTransitions(ticketKey);
      const match = transitions.find((t) => t.to.name === toStatus);
      if (!match) {
        throw new Error(`No transition to "${toStatus}"`);
      }
      const result = await api.doJiraTransition(ticketKey, match.id);
      if (!result.ok) throw new Error("Transition failed");
      await refresh();
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[ticketKey];
        return next;
      });
    },
    [refresh],
  );

  const value = useMemo<BoardContextValue>(
    () => ({
      board,
      tickets,
      byStatus,
      fetchedAt: response?.fetched_at ?? null,
      loading,
      error,
      summary,
      refresh,
      transition,
      pausePolling: pause,
      resumePolling: resume,
      optimisticMove,
    }),
    [
      board,
      tickets,
      byStatus,
      response,
      loading,
      error,
      summary,
      refresh,
      transition,
      pause,
      resume,
      optimisticMove,
    ],
  );

  return (
    <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be inside <BoardProvider>");
  return ctx;
}
