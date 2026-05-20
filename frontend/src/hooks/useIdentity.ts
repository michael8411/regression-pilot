import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IdentityStatus,
  OAuthConfigErrorResponse,
  OAuthProvider,
  StartOAuthResponse,
} from "@/types/identity";

const ROOT =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "http://127.0.0.1:8000";

const EMPTY_STATUS: IdentityStatus = {
  signed_in: false,
  profile: null,
  providers: {
    entra: { connected: false, needs_reconnect: false, auth_mode: "none" },
    github: { connected: false, needs_reconnect: false, auth_mode: "none" },
    atlassian: { connected: false, needs_reconnect: false, auth_mode: "none" },
  },
  manual_fallbacks: { jira: false, github: false, ado: false },
};

async function openAuthUrl(url: string): Promise<void> {
  // Prefer Tauri opener when running in the desktop shell; fall back to
  // window.open in a regular browser dev session.
  try {
    const mod = await import("@tauri-apps/plugin-opener");
    if (mod && typeof mod.openUrl === "function") {
      await mod.openUrl(url);
      return;
    }
  } catch {
    // not in Tauri or plugin missing
  }
  window.open(url, "_blank", "noopener");
}

export function useIdentity() {
  const [status, setStatus] = useState<IdentityStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [configMissing, setConfigMissing] = useState<string[] | null>(null);
  const pollTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ROOT}/auth/me`);
      if (!res.ok) throw new Error(`auth/me ${res.status}`);
      const data: IdentityStatus = await res.json();
      setStatus(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setOnboarding(false);
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimer.current !== null) return;
    setOnboarding(true);
    const startedAt = Date.now();
    pollTimer.current = window.setInterval(async () => {
      const data = await refresh();
      const allConnected =
        !!data &&
        data.signed_in &&
        Object.values(data.providers).every((p) => p.connected);
      if (allConnected) {
        stopPolling();
      } else if (Date.now() - startedAt > 5 * 60 * 1000) {
        // 5-minute timeout; user can re-trigger manually.
        stopPolling();
      }
    }, 2000);
  }, [refresh, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startSignIn = useCallback(async (): Promise<void> => {
    setConfigMissing(null);
    const res = await fetch(`${ROOT}/auth/start`, { method: "POST" });
    if (res.status === 409) {
      const body = (await res
        .json()
        .catch(() => null)) as OAuthConfigErrorResponse | null;
      setConfigMissing(body?.missing ?? []);
      return;
    }
    if (!res.ok) throw new Error(`auth/start ${res.status}`);
    const data = (await res.json()) as StartOAuthResponse;
    await openAuthUrl(data.authorize_url);
    startPolling();
  }, [startPolling]);

  const reconnectProvider = useCallback(
    async (provider: OAuthProvider): Promise<void> => {
      setConfigMissing(null);
      const res = await fetch(
        `${ROOT}/auth/reconnect/${encodeURIComponent(provider)}`,
        { method: "POST" },
      );
      if (res.status === 409) {
        const body = (await res
          .json()
          .catch(() => null)) as OAuthConfigErrorResponse | null;
        setConfigMissing(body?.missing ?? []);
        return;
      }
      if (!res.ok) throw new Error(`auth/reconnect ${res.status}`);
      const data = (await res.json()) as StartOAuthResponse;
      await openAuthUrl(data.authorize_url);
      startPolling();
    },
    [startPolling],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await fetch(`${ROOT}/auth/signout`, { method: "POST" });
    await refresh();
  }, [refresh]);

  return {
    status,
    loading,
    error,
    onboarding,
    configMissing,
    refresh,
    startSignIn,
    reconnectProvider,
    signOut,
  };
}
