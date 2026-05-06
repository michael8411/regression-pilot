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
  return first === "settings" || first === "onboarding" || first === "history";
}

function workspaceHome(ws: Workspace): Route {
  return ws === "regression"
    ? ["regression", "home"]
    : ws === "live"
    ? ["live", "home"]
    : ["assistant", "home"];
}

export function RouteProvider({
  children,
  initialRoute = DEFAULT_ROUTE,
  onRouteChange,
}: RouteProviderProps) {
  const [route, setRoute] = useState<Route>(initialRoute);
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
    goto(lastNonOverlayRef.current);
  }, [goto]);

  const gotoConversation = useCallback(
    (id: string) => goto(["assistant", "conversation", id]),
    [goto],
  );

  const value = useMemo<RouteContextValue>(
    () => ({
      route,
      previousRoute: previousRef.current,
      workspace: workspaceOf(route),
      goto,
      gotoWorkspace,
      back,
      closeOverlay,
      gotoConversation,
    }),
    [route, goto, gotoWorkspace, back, closeOverlay, gotoConversation],
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
