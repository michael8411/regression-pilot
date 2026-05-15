/**
 * Phase 07 — single source of truth for frontend HTTP request boilerplate.
 *
 * Before this module, every component-level `api.ts` resolved the API base
 * URL on its own (`import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000"`),
 * and each implemented its own error model. That made the audit
 * `rg "VITE_API_BASE|const BASE = \"http://127.0.0.1:8000\""` light up in
 * seven places.
 *
 * Callers should now do:
 *
 *     import { http } from "@/lib/http";
 *     const data = await http<MyType>("/some/endpoint");
 *     const created = await http<Foo>("/foo", { method: "POST", body });
 *
 * Or, when raw access to `Response` is required (e.g. streaming):
 *
 *     import { apiUrl } from "@/lib/http";
 *     const resp = await fetch(apiUrl("/ai/chat/stream"), { ... });
 *
 * The base URL still falls back to `http://127.0.0.1:8000` for local dev,
 * but the resolution lives in exactly one place.
 */

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
  const res = await fetch(apiUrl(path), {
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
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
