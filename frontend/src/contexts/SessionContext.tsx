import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  getActiveSession,
  createSession as createSessionApi,
  saveSessionState,
} from "@/lib/api";

const DELAY_MAP: Record<string, number> = {
  instructions: 1000,
  groups: 500,
};
const DEFAULT_DELAY = 800;

function delayForKey(key: string): number {
  return DELAY_MAP[key] ?? DEFAULT_DELAY;
}

export interface SessionValue {
  sessionId: string | null;
  restoredState: Record<string, any> | null;
  isRestoring: boolean;
  createSession: (projectKey: string, versionName?: string) => Promise<void>;
  refreshActiveSession: () => Promise<void>;
  saveState: (key: string, value: unknown) => void;
  saveStateImmediate: (key: string, value: unknown) => Promise<void>;
  saveStateBatch: (items: Record<string, unknown>) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restoredState, setRestoredState] = useState<Record<string, any> | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      setIsRestoring(true);
      try {
        const session = await getActiveSession();
        if (cancelled) return;
        const safeState =
          session.state && typeof session.state === "object" && !Array.isArray(session.state)
            ? session.state
            : {};
        sessionIdRef.current = session.id;
        setSessionId(session.id);
        setRestoredState(safeState);
        if (import.meta.env.DEV) {
          console.log("Session restored. Keys:", Object.keys(safeState));
        }
      } catch {
        if (cancelled) return;
        sessionIdRef.current = null;
        setSessionId(null);
        setRestoredState({});
        if (import.meta.env.DEV) {
          console.log("No active session available — starting fresh.");
        }
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    }

    restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      for (const id of Object.values(debounceRef.current)) clearTimeout(id);
      debounceRef.current = {};
    };
  }, []);

  const refreshActiveSession = useCallback(async (): Promise<void> => {
    setIsRestoring(true);
    try {
      const session = await getActiveSession();
      const safeState =
        session.state && typeof session.state === "object" && !Array.isArray(session.state)
          ? session.state
          : {};
      sessionIdRef.current = session.id;
      setSessionId(session.id);
      setRestoredState(safeState);
    } catch {
      sessionIdRef.current = null;
      setSessionId(null);
      setRestoredState({});
    } finally {
      setIsRestoring(false);
    }
  }, []);

  const createSession = useCallback(
    async (projectKey: string, versionName?: string): Promise<void> => {
      const session = await createSessionApi(projectKey, versionName);
      sessionIdRef.current = session.id;
      setSessionId(session.id);
    },
    []
  );

  const flushSave = useCallback(
    async (key: string, value: unknown): Promise<void> => {
      const id = sessionIdRef.current;
      if (!id) return;
      try {
        const response = await saveSessionState(id, { key, value });
        if (
          import.meta.env.DEV &&
          (response.secret_scan_warnings?.length ?? 0) > 0
        ) {
          console.warn(
            "Secret scan warnings for key:",
            key,
            response.secret_scan_warnings!.map((w) => w.pattern_name)
          );
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          sessionIdRef.current = null;
          setSessionId(null);
          return;
        }
        if (import.meta.env.DEV) {
          console.error(`saveState failed for key "${key}":`, err);
        }
      }
    },
    []
  );

  const saveState = useCallback(
    (key: string, value: unknown): void => {
      const existing = debounceRef.current[key];
      if (existing !== undefined) clearTimeout(existing);
      debounceRef.current[key] = setTimeout(async () => {
        delete debounceRef.current[key];
        await flushSave(key, value);
      }, delayForKey(key));
    },
    [flushSave]
  );

  const saveStateImmediate = useCallback(
    async (key: string, value: unknown): Promise<void> => {
      const existing = debounceRef.current[key];
      if (existing !== undefined) {
        clearTimeout(existing);
        delete debounceRef.current[key];
      }
      await flushSave(key, value);
    },
    [flushSave]
  );

  const saveStateBatch = useCallback(
    async (items: Record<string, unknown>): Promise<void> => {
      // Update in-memory state immediately so the next screen has the data
      // regardless of whether the backend save succeeds.
      setRestoredState((prev) => ({ ...(prev ?? {}), ...items }));

      const id = sessionIdRef.current;
      if (!id) return;

      try {
        const response = await saveSessionState(id, { items });
        if (
          import.meta.env.DEV &&
          (response.secret_scan_warnings?.length ?? 0) > 0
        ) {
          console.warn(
            "Secret scan warnings (batch):",
            response.secret_scan_warnings!.map((w) => w.pattern_name)
          );
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          sessionIdRef.current = null;
          setSessionId(null);
          return;
        }
        if (import.meta.env.DEV) {
          console.error("saveStateBatch failed:", err);
        }
      }
    },
    []
  );

  const value = useMemo<SessionValue>(
    () => ({
      sessionId,
      restoredState,
      isRestoring,
      createSession,
      refreshActiveSession,
      saveState,
      saveStateImmediate,
      saveStateBatch,
    }),
    [
      sessionId,
      restoredState,
      isRestoring,
      createSession,
      refreshActiveSession,
      saveState,
      saveStateImmediate,
      saveStateBatch,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be used inside <SessionProvider>");
  return ctx;
}
