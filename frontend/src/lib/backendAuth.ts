/**
 * Per-launch backend auth token helper.
 *
 * The backend generates a random token on startup and writes it to
 * %APPDATA%/Testdeck/runtime/backend-auth-token (or the TESTDECK_DATA_DIR
 * equivalent). Every protected API request must include the token as
 * X-Testdeck-Auth.
 *
 * Token resolution order:
 *  1. VITE_TESTDECK_AUTH_TOKEN env var (set in .env.local for browser-only dev)
 *  2. Tauri invoke("get_backend_auth_token") (packaged app / tauri dev)
 *
 * The token is cached in memory only — never in localStorage/sessionStorage.
 *
 * Resilience contract:
 *  - empty/missing tokens are NEVER cached (so a startup race recovers on the
 *    next request),
 *  - any 401 from the backend invalidates the cache and forces one retry with
 *    a freshly-read token (so a backend restart mid-session recovers without
 *    requiring the user to reload).
 */

let _cachedToken: string | null = null;
let _inflightFetch: Promise<string> | null = null;

async function _tauriGetToken(): Promise<string> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("get_backend_auth_token");
  } catch {
    return "";
  }
}

async function _fetchTokenOnce(): Promise<string> {
  const env = import.meta.env.VITE_TESTDECK_AUTH_TOKEN as string | undefined;
  if (env) return env;
  return _tauriGetToken();
}

export async function getBackendAuthToken(): Promise<string> {
  if (_cachedToken) return _cachedToken;
  // De-dupe concurrent fetches so we don't trigger several Tauri invokes when
  // the app first mounts and many components hit the API at once.
  if (!_inflightFetch) {
    _inflightFetch = _fetchTokenOnce().finally(() => {
      _inflightFetch = null;
    });
  }
  const tok = await _inflightFetch;
  if (tok) _cachedToken = tok;
  return tok;
}

/** Returns { "X-Testdeck-Auth": token } when a token is available. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getBackendAuthToken();
  return token ? { "X-Testdeck-Auth": token } : {};
}

/** Drop the cached token so the next call re-reads from the runtime file. */
export function _resetCachedToken(): void {
  _cachedToken = null;
}

/**
 * Drop-in replacement for `fetch` that adds the per-launch auth header and
 * transparently retries once on 401 with a freshly-read token.
 *
 * Use this for every backend call. Direct `fetch` is fine for non-backend
 * URLs (CDNs, OAuth redirects, etc.).
 */
export async function backendFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const send = async (token: string): Promise<Response> => {
    const headers = new Headers(init?.headers ?? {});
    if (token) headers.set("X-Testdeck-Auth", token);
    return fetch(input, { ...init, headers });
  };

  let token = await getBackendAuthToken();
  let res = await send(token);

  // The auth middleware tags its rejections with `X-Testdeck-Auth-Required: 1`.
  // Only those 401s are safe to silently retry — other 401s could be a real
  // upstream provider rejection that the user needs to see.
  if (res.status !== 401) return res;
  if (res.headers.get("X-Testdeck-Auth-Required") !== "1") return res;

  // Stale local-auth token — drop the cache, re-read once, retry exactly once.
  _resetCachedToken();
  token = await getBackendAuthToken();
  if (!token) return res;
  return send(token);
}
