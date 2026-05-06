import type { Session } from "@/types";
import type { Route } from "@/types/routing";
import { parseRoute } from "@/types/routing";

export type HistoryFilter = "all" | "draft" | "generated" | "pushed";

export function getTicketCount(session: Session): number {
  const t = session.state?.selectedTickets;
  return Array.isArray(t) ? t.length : 0;
}

export function getTestCaseCount(session: Session): number {
  const c = session.state?.testCases;
  return Array.isArray(c) ? c.length : 0;
}

export function getThemeCount(session: Session): number {
  const g = session.state?.editableGroups;
  return g && typeof g === "object" && !Array.isArray(g) ? Object.keys(g).length : 0;
}

export function isPushed(session: Session): boolean {
  return Boolean(session.state?.pushResult) || session.status === "pushed";
}

export function classifySession(session: Session): HistoryFilter {
  if (isPushed(session)) return "pushed";
  if (getTestCaseCount(session) > 0) return "generated";
  return "draft";
}

export function matchesFilter(session: Session, filter: HistoryFilter): boolean {
  if (filter === "all") return true;
  return classifySession(session) === filter;
}

// SECURITY: only read .key. Never .summary or .description — those can contain
// customer data and internal connection strings. See plans/UIOverhaul/phase-5-history-drawer.md §13.
export function matchesSearch(session: Session, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const haystack: string[] = [];
  if (session.project_key)  haystack.push(session.project_key);
  if (session.version_name) haystack.push(session.version_name);
  if (session.status)       haystack.push(session.status);

  const tickets = session.state?.selectedTickets;
  if (Array.isArray(tickets)) {
    for (const t of tickets) {
      if (typeof t?.key === "string") haystack.push(t.key);
    }
  }

  return haystack.some((h) => h.toLowerCase().includes(q));
}

/**
 * Pick the most useful route for a restored session.
 * Prefers an explicit currentRoute when valid.
 */
export function routeForSession(session: Session): Route {
  const explicit = parseRoute(session.state?.currentRoute);
  if (explicit) return explicit;

  if (getTestCaseCount(session) > 0) return ["regression", "review"];
  if (getThemeCount(session) > 0)    return ["regression", "themes"];
  if (getTicketCount(session) > 0)   return ["regression", "themes"];

  return ["regression", "home"];
}

/** Compact relative time. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1)   return "just now";
  if (min < 60)  return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7)   return `${day}d ago`;
  const date = new Date(then);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function sessionLabel(session: Session): string {
  const v = session.version_name ?? "no version";
  return `${session.project_key} · ${v}`;
}
