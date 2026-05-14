import { useCallback, useEffect, useState } from "react";
import type {
  RepoMapping,
  RepoMappingCreate,
  RepoMappingUpdate,
} from "@/types/repoMapping";
import {
  createRepoMapping,
  deleteRepoMapping,
  listRepoMappings,
  updateRepoMapping,
} from "../lib/repoMappingApi";

export function useRepoMappings() {
  const [mappings, setMappings] = useState<RepoMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMappings(await listRepoMappings());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load mappings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (payload: RepoMappingCreate) => {
      const created = await createRepoMapping(payload);
      setMappings((prev) => [...prev, created].sort((a, b) =>
        a.jira_project.localeCompare(b.jira_project),
      ));
      return created;
    },
    [],
  );

  const update = useCallback(
    async (id: string, payload: RepoMappingUpdate) => {
      const updated = await updateRepoMapping(id, payload);
      setMappings((prev) => prev.map((m) => (m.id === id ? updated : m)));
      return updated;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await deleteRepoMapping(id);
    setMappings((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { mappings, loading, error, refresh, create, update, remove };
}
