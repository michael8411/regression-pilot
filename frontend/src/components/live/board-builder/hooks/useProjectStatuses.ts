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
  /**
   * Layer 1 — Workflow Columns. Authoritative L→R column order from the
   * backend's `workflow_column_order` response field. May be empty until
   * the first fetch resolves, or if an older backend omits the field.
   */
  workflowColumnOrder: string[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

interface StatusCacheEntry {
  statuses: ProjectStatus[];
  workflowColumnOrder: string[];
}

const sessionCache = new Map<string, StatusCacheEntry>();

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
  const cachedEntry = projectKey ? sessionCache.get(projectKey) : null;
  const [statuses, setStatuses] = useState<ProjectStatus[]>(
    () => cachedEntry?.statuses ?? [],
  );
  const [workflowColumnOrder, setWorkflowColumnOrder] = useState<string[]>(
    () => cachedEntry?.workflowColumnOrder ?? [],
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchFor = useCallback(async (key: string, force: boolean) => {
    if (!force) {
      const cached = sessionCache.get(key);
      if (cached) {
        setStatuses(cached.statuses);
        setWorkflowColumnOrder(cached.workflowColumnOrder);
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
      // Fall back to derived order from statuses if the backend omits it
      // (older deploys); the derive function will refine this further.
      const order =
        resp.workflow_column_order ?? mapped.map((s) => s.name);
      sessionCache.set(key, {
        statuses: mapped,
        workflowColumnOrder: order,
      });
      setStatuses(mapped);
      setWorkflowColumnOrder(order);
    } catch (e) {
      if (id !== requestId.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load statuses";
      setError(msg);
      setStatuses([]);
      setWorkflowColumnOrder([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!projectKey) {
      setStatuses([]);
      setWorkflowColumnOrder([]);
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

  return { statuses, workflowColumnOrder, loading, error, retry };
}
