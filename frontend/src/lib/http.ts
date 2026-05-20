/**
 * Phase 07 — single source of truth for frontend HTTP request boilerplate.
 *
 * Every backend call goes through `backendFetch`, which adds the per-launch
 * X-Testdeck-Auth header. For streaming endpoints that need raw Response
 * access, callers should import { backendFetch } from "@/lib/backendAuth"
 * and use it directly with apiUrl().
 */

import { backendFetch } from "@/lib/backendAuth";

/** Resolved base URL for the backend. Vite envs are inlined at build time. */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "http://127.0.0.1:8000";

/** Build a fully-qualified URL for a relative `path`. */
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

/** Shared error model — every API failure produces one of these. */
export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly detail: string;

  constructor(status: number, statusText: string, detail: string) {
    super(
      detail
        ? `${status} ${statusText}: ${detail}`
        : `${status} ${statusText}`,
    );
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
  }
}

/**
 * JSON `fetch` wrapper. Sets `content-type: application/json` by default,
 * raises `HttpError` on non-2xx responses, and parses the body as JSON on
 * success.
 *
 * When the backend response is `204 No Content` (or empty), `null` is
 * returned and the caller is responsible for narrowing.
 */
export async function http<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await backendFetch(apiUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    // Try JSON body first, fall back to text. Either way, surface a
    // single `HttpError` shape so callers don't have to special-case.
    const ctype = res.headers.get("content-type") ?? "";
    let detail = "";
    if (ctype.includes("application/json")) {
      try {
        const body = await res.json();
        detail =
          (body && typeof body === "object" && "detail" in body
            ? String((body as { detail?: unknown }).detail ?? "")
            : "") ||
          JSON.stringify(body).slice(0, 200);
      } catch {
        detail = "";
      }
    } else {
      try {
        const text = await res.text();
        detail = (text ?? "").slice(0, 200);
      } catch {
        detail = "";
      }
    }
    throw new HttpError(res.status, res.statusText, detail);
  }

  // Empty body → null.
  if (res.status === 204) return null as unknown as T;
  const text = await res.text();
  if (!text) return null as unknown as T;
  return JSON.parse(text) as T;
}
