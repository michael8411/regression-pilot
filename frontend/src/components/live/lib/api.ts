import type {
  BoardResponse,
  JiraCommentSubmitResponse,
  JiraTransition,
  JiraTransitionResult,
  LiveBoard,
  LiveBoardProfile,
  LiveBoardViewPreferences,
} from "@/types/live";
import type {
  GeneratedTestCases,
  JiraProject,
  JiraTicket,
  JiraVersion,
} from "@/types";

const BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:8000";

async function jfetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${input}`, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// Boards CRUD
export function listLiveBoards(): Promise<LiveBoard[]> {
  return jfetch("/live/boards");
}

export interface CreateLiveBoardBody {
  name: string;
  jql: string;
  columns?: string[];
  profile?: LiveBoardProfile;
  view_prefs?: LiveBoardViewPreferences;
}

export function createLiveBoard(body: CreateLiveBoardBody): Promise<LiveBoard> {
  return jfetch("/live/boards", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getLiveBoard(id: string): Promise<LiveBoard> {
  return jfetch(`/live/boards/${encodeURIComponent(id)}`);
}

export interface PatchLiveBoardBody {
  name?: string;
  jql?: string;
  columns?: string[];
  pinned?: boolean;
  profile?: LiveBoardProfile;
  view_prefs?: LiveBoardViewPreferences;
}

export function patchLiveBoard(
  id: string,
  patch: PatchLiveBoardBody,
): Promise<LiveBoard> {
  return jfetch(`/live/boards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteLiveBoard(id: string): Promise<{ deleted: boolean }> {
  return jfetch(`/live/boards/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Board read (Jira pass-through)
export function fetchBoardTickets(jql: string): Promise<BoardResponse> {
  return jfetch(`/jira/board?jql=${encodeURIComponent(jql)}`);
}

// Phase 03 — Jira projects/versions for the simple board builder.
export function listJiraProjectsForLive(): Promise<JiraProject[]> {
  return jfetch("/jira/projects");
}

export function listJiraVersionsForLive(
  projectKey: string,
  status: "unreleased" | "released" | "all" = "unreleased",
): Promise<JiraVersion[]> {
  return jfetch(
    `/jira/projects/${encodeURIComponent(projectKey)}/versions?status=${encodeURIComponent(status)}`,
  );
}

// Comments
export function postJiraComment(
  ticketKey: string,
  body: string,
): Promise<JiraCommentSubmitResponse> {
  return jfetch(`/jira/tickets/${encodeURIComponent(ticketKey)}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

// Transitions
export function listJiraTransitions(
  ticketKey: string,
): Promise<JiraTransition[]> {
  return jfetch(`/jira/tickets/${encodeURIComponent(ticketKey)}/transitions`);
}

export function doJiraTransition(
  ticketKey: string,
  transitionId: string,
): Promise<JiraTransitionResult> {
  return jfetch(`/jira/tickets/${encodeURIComponent(ticketKey)}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transitionId }),
  });
}

// Live generate
export function liveGenerate(
  ticket: JiraTicket,
  instructions = "",
): Promise<GeneratedTestCases> {
  return jfetch("/live/generate", {
    method: "POST",
    body: JSON.stringify({ ticket, instructions }),
  });
}

// Pinned ticket fetch (8c uses; exported here for symmetry)
export function fetchTicketsByKeys(keys: string[]): Promise<JiraTicket[]> {
  return jfetch("/jira/tickets/by-keys", {
    method: "POST",
    body: JSON.stringify({ keys }),
  });
}
