/**
 * Phase 06b — hook that owns the publish-to-Jira mutation lifecycle.
 *
 * Backed by `POST /live/generated-cases/{id}/publish`. The hook is
 * intentionally stateless about which case set it targets — callers pass
 * the id at call time so a single dialog can switch between drafts.
 *
 * Lifecycle states:
 *   - idle: never called or `reset()` was invoked
 *   - publishing: in-flight
 *   - success: server returned 2xx (any target/status, including draft-on-fail)
 *   - error: HttpError or unexpected exception
 *
 * The hook does not mutate the persisted generated-case row directly; the
 * server is the source of truth. Callers may pass `onSuccess` to refresh
 * the local drafts list after a publish completes.
 */

import { useCallback, useRef, useState } from "react";
import * as api from "@/components/live/lib/api";
import { HttpError } from "@/lib/http";
import type {
  LivePublishCasesRequest,
  LivePublishCasesResponse,
} from "@/types/live";

export type PublishStatus = "idle" | "publishing" | "success" | "error";

export interface PublishErrorShape {
  message: string;
  status?: number;
  /** Backend code from `HTTPException.detail`. Useful for "duplicate" UX. */
  code?: string;
}

export interface UsePublishLiveCasesResult {
  status: PublishStatus;
  result: LivePublishCasesResponse | null;
  error: PublishErrorShape | null;
  publishCases: (
    caseSetId: string,
    request: LivePublishCasesRequest,
  ) => Promise<LivePublishCasesResponse | null>;
  reset: () => void;
}

interface Options {
  /** Fired after a successful publish (any status). Used to refresh drafts. */
  onSuccess?: (result: LivePublishCasesResponse) => void;
}

/**
 * Heuristic to surface the backend's typed error code into the UI without
 * coupling to the exact HttpError serialization shape. The route maps:
 *   - 404 case_set_not_found    -> code "case_set_not_found"
 *   - 409 duplicate_publish_*   -> code "duplicate_publish_unconfirmed"
 *   - 400 invalid_case_index    -> code "invalid_case_index"
 * The fallback is the raw HTTP status.
 */
function inferErrorCode(err: HttpError): string {
  const detail = err.detail || "";
  if (err.status === 409) return "duplicate_publish_unconfirmed";
  if (err.status === 404) return "case_set_not_found";
  if (detail.toLowerCase().includes("case index"))
    return "invalid_case_index";
  return `http_${err.status}`;
}

export function usePublishLiveCases(
  options: Options = {},
): UsePublishLiveCasesResult {
  const [status, setStatus] = useState<PublishStatus>("idle");
  const [result, setResult] = useState<LivePublishCasesResponse | null>(null);
  const [error, setError] = useState<PublishErrorShape | null>(null);
  const mounted = useRef<boolean>(true);

  const publishCases = useCallback(
    async (
      caseSetId: string,
      request: LivePublishCasesRequest,
    ): Promise<LivePublishCasesResponse | null> => {
      setStatus("publishing");
      setError(null);
      try {
        const resp = await api.publishLiveGeneratedCases(caseSetId, request);
        if (mounted.current) {
          setResult(resp);
          setStatus("success");
        }
        if (options.onSuccess) {
          try {
            options.onSuccess(resp);
          } catch {
            /* never let consumer callbacks break the hook */
          }
        }
        return resp;
      } catch (e: unknown) {
        let payload: PublishErrorShape;
        if (e instanceof HttpError) {
          payload = {
            message: e.detail || `Publish failed (${e.status})`,
            status: e.status,
            code: inferErrorCode(e),
          };
        } else if (e instanceof Error) {
          payload = { message: e.message };
        } else {
          payload = { message: "Publish failed" };
        }
        if (mounted.current) {
          setError(payload);
          setStatus("error");
        }
        return null;
      }
    },
    [options],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, publishCases, reset };
}
