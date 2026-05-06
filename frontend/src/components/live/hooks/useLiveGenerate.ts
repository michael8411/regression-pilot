import { useCallback, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { GeneratedTestCases, JiraTicket } from "@/types";

export interface UseLiveGenerateResult {
  generating: boolean;
  result: GeneratedTestCases | null;
  error: string | null;
  reset: () => void;
  generate: (ticket: JiraTicket, instructions: string) => Promise<void>;
}

export function useLiveGenerate(): UseLiveGenerateResult {
  const [generating, setGenerating] = useState<boolean>(false);
  const [result, setResult] = useState<GeneratedTestCases | null>(null);
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

  return { generating, result, error, reset, generate };
}
