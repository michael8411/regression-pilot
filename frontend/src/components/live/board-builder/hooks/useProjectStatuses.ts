import { useCallback, useEffect, useRef, useState } from "react";
import {
  getJiraProjectStatuses,
  type JiraProjectStatusRow,
} from "@/components/live/lib/api";

export interface ProjectStatus {
  name: string;
  category: "new" | "indeterminate" | "done";
  issueTypes: string[];
}

export interface UseProjectStatusesResult {
  statuses: ProjectStatus[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const sessionCache = new Map<string, ProjectStatus[]>();

function fromRow(row: JiraProjectStatusRow): ProjectStatus {
  return {
    name: row.name,
    category: row.category,
    issueTypes: row.issue_types ?? [],
  };
}

export function useProjectStatuses(
  projectKey: string | null,
): UseProjectStatusesResult {
  const [statuses, setStatuses] = useState<ProjectStatus[]>(() =>
    projectKey ? sessionCache.get(projectKey) ?? [] : [],
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchFor = useCallback(async (key: string, force: boolean) => {
    if (!force) {
      const cached = sessionCache.get(key);
      if (cached) {
        setStatuses(cached);
        setError(null);
        setLoading(false);
        return;
      }
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const resp = await getJiraProjectStatuses(key);
      if (id !== requestId.current) return;
      const mapped = resp.statuses.map(fromRow);
      sessionCache.set(key, mapped);
      setStatuses(mapped);
    } catch (e) {
      if (id !== requestId.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load statuses";
      setError(msg);
      setStatuses([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!projectKey) {
      setStatuses([]);
      setError(null);
      setLoading(false);
      requestId.current += 1;
      return;
    }
    void fetchFor(projectKey, false);
  }, [projectKey, fetchFor]);

  const retry = useCallback(() => {
    if (!projectKey) return;
    sessionCache.delete(projectKey);
    void fetchFor(projectKey, true);
  }, [projectKey, fetchFor]);

  return { statuses, loading, error, retry };
}
