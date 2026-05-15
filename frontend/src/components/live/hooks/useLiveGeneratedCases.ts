/**
 * Phase 06 — persisted Live generated-case drafts hook.
 *
 * Backed by `/live/generated-cases` (encrypted SQLite). Used by:
 *   - the AI drawer panel to save successful generations,
 *   - the drawer Test Cases tab to render durable drafts,
 *   - the drawer Test Cases tab to delete drafts.
 *
 * The hook is parameterised by `ticketKey`: when set, it lists only drafts
 * for that ticket. Pass `null` to disable fetching (e.g. drawer not open).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/components/live/lib/api";
import type {
  LiveGeneratedCases,
  LiveGeneratedCasesStatus,
} from "@/types/live";

export interface SaveGeneratedCasesArgs {
  ticketKey: string;
  boardId?: string | null;
  instructions?: string;
  cases: unknown[];
  contextMetadata?: Record<string, unknown> | null;
  status?: LiveGeneratedCasesStatus;
}

export interface PatchGeneratedCasesArgs {
  instructions?: string;
  cases?: unknown[];
  status?: LiveGeneratedCasesStatus;
}

export interface UseLiveGeneratedCasesResult {
  drafts: LiveGeneratedCases[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (args: SaveGeneratedCasesArgs) => Promise<LiveGeneratedCases | null>;
  remove: (id: string) => Promise<void>;
  patch: (
    id: string,
    args: PatchGeneratedCasesArgs,
  ) => Promise<LiveGeneratedCases | null>;
}

export function useLiveGeneratedCases(
  ticketKey: string | null,
): UseLiveGeneratedCasesResult {
  const [drafts, setDrafts] = useState<LiveGeneratedCases[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef<boolean>(true);

  const refresh = useCallback(async () => {
    if (!ticketKey) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await api.listLiveGeneratedCases({ ticketKey });
      if (mounted.current) setDrafts(list);
    } catch (e: any) {
      if (mounted.current) {
        setError(e?.message ?? "Failed to load saved test cases");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [ticketKey]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const save = useCallback(
    async (
      args: SaveGeneratedCasesArgs,
    ): Promise<LiveGeneratedCases | null> => {
      try {
        const created = await api.createLiveGeneratedCases({
          ticket_key: args.ticketKey,
          board_id: args.boardId ?? null,
          instructions: args.instructions ?? "",
          cases: args.cases,
          context_metadata: args.contextMetadata ?? null,
          status: args.status ?? "draft",
        });
        if (mounted.current) {
          setDrafts((prev) => [created, ...prev]);
        }
        return created;
      } catch (e: any) {
        if (mounted.current) {
          setError(e?.message ?? "Failed to save test cases");
        }
        return null;
      }
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    let snapshot: LiveGeneratedCases | null = null;
    setDrafts((prev) => {
      snapshot = prev.find((d) => d.id === id) ?? null;
      return prev.filter((d) => d.id !== id);
    });
    try {
      await api.deleteLiveGeneratedCases(id);
    } catch (e) {
      if (mounted.current && snapshot) {
        setDrafts((prev) => [snapshot!, ...prev]);
      }
      throw e;
    }
  }, []);

  const patch = useCallback(
    async (
      id: string,
      args: PatchGeneratedCasesArgs,
    ): Promise<LiveGeneratedCases | null> => {
      try {
        const updated = await api.patchLiveGeneratedCases(id, {
          instructions: args.instructions,
          cases: args.cases,
          status: args.status,
        });
        if (mounted.current) {
          setDrafts((prev) =>
            prev.map((d) => (d.id === updated.id ? updated : d)),
          );
        }
        return updated;
      } catch (e: any) {
        if (mounted.current) {
          setError(e?.message ?? "Failed to update test cases");
        }
        return null;
      }
    },
    [],
  );

  return { drafts, loading, error, refresh, save, remove, patch };
}
