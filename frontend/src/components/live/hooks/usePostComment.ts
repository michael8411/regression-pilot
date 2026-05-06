import { useCallback, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { JiraCommentSubmitResponse } from "@/types/live";

export interface UsePostCommentResult {
  posting: boolean;
  warnings: { pattern_name: string }[];
  error: string | null;
  clearWarnings: () => void;
  post: (
    ticketKey: string,
    body: string,
  ) => Promise<JiraCommentSubmitResponse | null>;
}

export function usePostComment(): UsePostCommentResult {
  const [posting, setPosting] = useState<boolean>(false);
  const [warnings, setWarnings] = useState<{ pattern_name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const post = useCallback(async (ticketKey: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return null;
    setPosting(true);
    setError(null);
    try {
      const res = await api.postJiraComment(ticketKey, trimmed);
      setWarnings(res.secret_scan_warnings ?? []);
      return res;
    } catch (e: any) {
      setError(e?.message ?? "Failed to post comment");
      return null;
    } finally {
      setPosting(false);
    }
  }, []);

  const clearWarnings = useCallback(() => setWarnings([]), []);

  return { posting, warnings, error, clearWarnings, post };
}
