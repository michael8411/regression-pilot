import { useCallback, useMemo, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { JiraTicket } from "@/types";
import type { ContextMetadata, LiveGenerateResponse } from "@/types/live";

export interface UseLiveGenerateResult {
  generating: boolean;
  result: LiveGenerateResponse | null;
  error: string | null;
  /** Compact provider/tool labels for the "Using tools:" indicator. */
  toolsUsed: string[];
  contextMetadata: ContextMetadata | null;
  reset: () => void;
  generate: (ticket: JiraTicket, instructions: string) => Promise<void>;
}

const PROVIDER_LABEL: Record<string, string> = {
  atlassian: "jira.ticket",
  github: "github.pr_diff",
  ado: "ado.pr_diff",
  sql_server: "sql.schema",
  zephyr_read: "zephyr.existing_tests",
};

function compactToolLabels(meta: ContextMetadata | null | undefined): string[] {
  if (!meta) return [];
  const errored = new Set(meta.errors.map((e) => e.provider));
  // Show only providers that ran without an error, in routing order.
  const ordered = meta.routing_decisions
    .filter((d) => d.included && !errored.has(d.provider))
    .map((d) => PROVIDER_LABEL[d.provider] ?? d.provider);
  return Array.from(new Set(ordered));
}

export function useLiveGenerate(): UseLiveGenerateResult {
  const [generating, setGenerating] = useState<boolean>(false);
  const [result, setResult] = useState<LiveGenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const generate = useCallback(
    async (ticket: JiraTicket, instructions: string) => {
      setGenerating(true);
      setError(null);
      setResult(null);
      try {
        const r = await api.liveGenerate(ticket, instructions);
        setResult(r);
      } catch (e: any) {
        setError(e?.message ?? "Generation failed");
      } finally {
        setGenerating(false);
      }
    },
    [],
  );

  const toolsUsed = useMemo(
    () => compactToolLabels(result?.context_metadata),
    [result],
  );

  return {
    generating,
    result,
    error,
    toolsUsed,
    contextMetadata: result?.context_metadata ?? null,
    reset,
    generate,
  };
}
