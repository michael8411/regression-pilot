import { useState, useCallback } from "react";

/**
 * Generic async action hook with loading/error state.
 */
export function useAsync<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (fn: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      setData(result);
      return result;
    } catch (err: any) {
      const msg = err.message || "Unknown error";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, execute, reset, setData };
}

/**
 * Selection state for ticket checkboxes.
 */
export function useSelection<T extends { key: string }>() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback((items: T[]) => {
    setSelected(new Set(items.map((i) => i.key)));
  }, []);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const isSelected = useCallback((key: string) => selected.has(key), [selected]);

  return { selected, toggle, selectAll, deselectAll, isSelected, count: selected.size };
}
