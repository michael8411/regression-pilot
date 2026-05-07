/**
 * Route model for the v2 UI overhaul.
 *
 * The route is a discriminated tuple: [Workspace, Screen] for workspaces,
 * [OverlayScreen] for overlays, or the 3-tuple ["assistant", "conversation", id]
 * for a specific conversation.
 *
 * Adding a new screen is a pure type change here plus a render branch in
 * the workspace's screen switch. No parallel string unions to keep in sync.
 */

import type { AppView } from "@/types";

export type Workspace = "regression" | "live" | "assistant";

export type RegressionScreen =
  | "home"
  | "workbench"
  | "themes"
  | "generate"
  | "review"
  | "push"
  | "cycles";

export type LiveScreen = "home" | "board" | "pinned";

export type AssistantScreen = "home" | "conversation";

/** Screens that exist outside any workspace — rendered over the shell. */
export type OverlayScreen =
  | "settings"
  | "onboarding"
  | "history"
  | "mcpConnections";

export type Route =
  | ["regression", RegressionScreen]
  | ["live", "home"]
  | ["live", "board", string]
  | ["live", "pinned"]
  | ["assistant", "home"]
  | ["assistant", "conversation", string]
  | [OverlayScreen];

/** Tuple equality helper — used by nav highlighting and effect deps. */
export function routeEq(a: Route, b: Route): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === (b as unknown as unknown[])[i]);
}

/** Convenient alias for the workspace portion of a route. */
export function workspaceOf(route: Route): Workspace | null {
  const first = route[0];
  if (first === "regression" || first === "live" || first === "assistant") {
    return first;
  }
  return null;
}

/** Human-readable labels used by the breadcrumb. */
export const ROUTE_LABELS: {
  workspace: Record<Workspace, string>;
  regression: Record<RegressionScreen, string>;
  live: Record<LiveScreen, string>;
  assistant: Record<AssistantScreen, string>;
  overlay: Record<OverlayScreen, string>;
} = {
  workspace: {
    regression: "Regression",
    live:       "Live Testing",
    assistant:  "Assistant",
  },
  regression: {
    home:      "Home",
    workbench: "Tickets",
    themes:    "Themes",
    generate:  "Generate",
    review:    "Review",
    push:      "Push",
    cycles:    "Test Cycles",
  },
  live: {
    home:   "Boards",
    board:  "Board",
    pinned: "Pinned",
  },
  assistant: {
    home:         "Home",
    conversation: "Conversation",
  },
  overlay: {
    settings:   "Settings",
    onboarding: "Onboarding",
    history:    "History",
    mcpConnections: "Connections",
  },
};

const VALID_REGRESSION: RegressionScreen[] =
  ["home", "workbench", "themes", "generate", "review", "push", "cycles"];
const VALID_OVERLAYS:  OverlayScreen[]   = ["settings", "onboarding", "history", "mcpConnections"];

/** Defensive parser for session-restored routes. Returns null on any deviation. */
export function parseRoute(raw: unknown): Route | null {
  if (!Array.isArray(raw)) return null;
  const [a, b] = raw;
  if (typeof a !== "string") return null;
  if (raw.length === 1) {
    return (VALID_OVERLAYS as string[]).includes(a)
      ? ([a as OverlayScreen] as Route)
      : null;
  }
  if (raw.length === 2 && typeof b === "string") {
    if (a === "regression" && (VALID_REGRESSION as string[]).includes(b))
      return ["regression", b as RegressionScreen];
    if (a === "live" && b === "home")    return ["live", "home"];
    if (a === "live" && b === "pinned")  return ["live", "pinned"];
    if (a === "assistant" && b === "home")
      return ["assistant", "home"];
  }
  if (raw.length === 3 && typeof raw[2] === "string") {
    if (a === "assistant" && b === "conversation") {
      return ["assistant", "conversation", raw[2]];
    }
    if (a === "live" && b === "board") {
      return ["live", "board", raw[2]];
    }
  }
  return null;
}

/** Convert a v1 AppView to the nearest v2 Route. */
export function legacyViewToRoute(v?: AppView): Route | null {
  switch (v) {
    case "setup":    return ["regression", "home"];
    case "select":   return ["regression", "workbench"];
    case "generate": return ["regression", "generate"];
    case "review":   return ["regression", "review"];
    case "chat":     return ["assistant", "home"];
    default:         return null;
  }
}

/** Convert a v2 Route back to an AppView for v1-compatible persistence. */
export function mapRouteToLegacyView(route: Route): AppView | null {
  if (route[0] === "regression") {
    switch (route[1]) {
      case "home":      return "setup";
      case "workbench": return "select";
      case "themes":    return "select";
      case "generate":  return "generate";
      case "review":    return "review";
      case "push":      return "review";
      case "cycles":    return null;
    }
  }
  if (route[0] === "assistant") {
    if (route[1] === "home")         return "chat";
    if (route[1] === "conversation") return "chat";
  }
  if (route[0] === "live") {
    // No legacy view exists for Live Testing.
    return null;
  }
  return null;
}

/** Shell-UI state for the TopBar session chip. */
export interface SessionChipData {
  project: string;
  version: string;
  ticketCount: number;
  themeCount: number;
  lastSavedAt: string | null;
}

/** Produce breadcrumb labels for a route. Phase 4 screens may extend this. */
export function buildCrumbs(route: Route): string[] {
  if (route.length === 1) {
    return [ROUTE_LABELS.overlay[route[0]]];
  }
  const ws = route[0];
  const wsLabel = ROUTE_LABELS.workspace[ws];
  if (ws === "regression") {
    return [wsLabel, ROUTE_LABELS.regression[route[1]]];
  }
  if (ws === "live") {
    if (route[1] === "home")   return [wsLabel, "Boards"];
    if (route[1] === "board")  return [wsLabel, "Board"];
    return [wsLabel, "Pinned"];
  }
  if (route[1] === "home") return [wsLabel, "Conversations"];
  return [wsLabel, "Conversation"];
}
