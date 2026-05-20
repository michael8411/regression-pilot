import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Route, Workspace } from "@/types/routing";
import { routeEq, workspaceOf } from "@/types/routing";

interface RouteState {
  route: Route;
  previousRoute: Route | null;
  workspace: Workspace | null;
  /**
   * Bumped whenever a query-only navigation happens (e.g. switching settings
   * panes via `?pane=...`). Consumers that read `window.location.search`
   * can include this in their memo deps to re-evaluate.
   */
  routeNonce: number;
}

interface RouteActions {
  /** Navigate to a route. Idempotent if already there. */
  goto: (next: Route) => void;
  /** Navigate to a workspace's home screen. */
  gotoWorkspace: (ws: Workspace) => void;
  /** Pop back to the previous route if one exists, else no-op. */
  back: () => void;
  /** Close an overlay and return to the last non-overlay route. */
  closeOverlay: () => void;
  /** Navigate directly to a specific conversation. */
  gotoConversation: (conversationId: string) => void;
  /** Navigate directly to a Live board. */
  gotoBoard: (boardId: string) => void;
  /** Open the Settings overlay (Phase 11). */
  gotoSettings: () => void;
  /** Open Settings at a specific pane via `?pane=<id>` (Phase 11). */
  gotoSettingsPane: (pane: string) => void;
}

type RouteContextValue = RouteState & RouteActions;

const RouteContext = createContext<RouteContextValue | null>(null);

interface RouteProviderProps {
  children: ReactNode;
  /** Starting route. Supplied by App.tsx after restoring from session. */
  initialRoute?: Route;
  /** Invoked on every navigation. Usually wires to useSession.saveState. */
  onRouteChange?: (next: Route) => void;
}

const DEFAULT_ROUTE: Route = ["regression", "home"];

function isOverlay(route: Route): boolean {
  const first = route[0];
  return (
    first === "settings" ||
    first === "onboarding" ||
    first === "history"
  );
}

function workspaceHome(ws: Workspace): Route {
  return ws === "regression"
    ? ["regression", "home"]
    : ws === "live"
    ? ["live", "home"]
    : ["assistant", "home"];
}

function setSearchParam(name: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore — non-window environments (tests/SSR) don't need URL sync
  }
}

export function RouteProvider({
  children,
  initialRoute = DEFAULT_ROUTE,
  onRouteChange,
}: RouteProviderProps) {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [routeNonce, setRouteNonce] = useState<number>(0);
  const previousRef = useRef<Route | null>(null);
  const lastNonOverlayRef = useRef<Route>(
    isOverlay(initialRoute) ? DEFAULT_ROUTE : initialRoute,
  );

  const goto = useCallback(
    (next: Route) => {
      setRoute((prev) => {
        if (routeEq(prev, next)) return prev;
        previousRef.current = prev;
        if (!isOverlay(prev)) lastNonOverlayRef.current = prev;
        onRouteChange?.(next);
        return next;
      });
    },
    [onRouteChange],
  );

  const gotoWorkspace = useCallback(
    (ws: Workspace) => goto(workspaceHome(ws)),
    [goto],
  );

  const back = useCallback(() => {
    const prev = previousRef.current;
    if (prev) goto(prev);
  }, [goto]);

  const closeOverlay = useCallback(() => {
    setSearchParam("pane", null);
    goto(lastNonOverlayRef.current);
  }, [goto]);

  const gotoConversation = useCallback(
    (id: string) => goto(["assistant", "conversation", id]),
    [goto],
  );

  const gotoBoard = useCallback(
    (id: string) => goto(["live", "board", id]),
    [goto],
  );

  const gotoSettings = useCallback(() => {
    setSearchParam("pane", null);
    goto(["settings"]);
    setRouteNonce((n) => n + 1);
  }, [goto]);

  const gotoSettingsPane = useCallback(
    (pane: string) => {
      setSearchParam("pane", pane);
      goto(["settings"]);
      setRouteNonce((n) => n + 1);
    },
    [goto],
  );

  const value = useMemo<RouteContextValue>(
    () => ({
      route,
      previousRoute: previousRef.current,
      workspace: workspaceOf(route),
      routeNonce,
      goto,
      gotoWorkspace,
      back,
      closeOverlay,
      gotoConversation,
      gotoBoard,
      gotoSettings,
      gotoSettingsPane,
    }),
    [
      route,
      routeNonce,
      goto,
      gotoWorkspace,
      back,
      closeOverlay,
      gotoConversation,
      gotoBoard,
      gotoSettings,
      gotoSettingsPane,
    ],
  );

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

/** Access the route and navigation helpers. */
export function useRoute(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) {
    throw new Error("useRoute must be used inside a <RouteProvider>");
  }
  return ctx;
}
