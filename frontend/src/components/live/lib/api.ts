import type {
  BoardResponse,
  JiraCommentSubmitResponse,
  JiraTransition,
  JiraTransitionResult,
  LiveActivityEvent,
  LiveActivityKind,
  LiveBoard,
  LiveBoardProfile,
  LiveBoardViewPreferences,
  LiveGeneratedCases,
  LiveGeneratedCasesStatus,
  LivePinnedTicket,
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

// ===========================================================================
// Phase 06 — encrypted SQLite-backed Live workflow artifacts.
// All three resource families share the /live/* prefix.
// ===========================================================================

// --- Pinned tickets --------------------------------------------------------

export function listLivePins(): Promise<LivePinnedTicket[]> {
  return jfetch("/live/pins");
}

export interface PutLivePinBody {
  board_id?: string | null;
  ticket_snapshot?: Record<string, unknown> | null;
}

export function putLivePin(
  ticketKey: string,
  body: PutLivePinBody = {},
): Promise<LivePinnedTicket> {
  return jfetch(`/live/pins/${encodeURIComponent(ticketKey)}`, {
    method: "PUT",
    body: JSON.stringify({
      board_id: body.board_id ?? null,
      ticket_snapshot: body.ticket_snapshot ?? null,
    }),
  });
}

export function deleteLivePin(
  ticketKey: string,
): Promise<{ deleted: boolean }> {
  return jfetch(`/live/pins/${encodeURIComponent(ticketKey)}`, {
    method: "DELETE",
  });
}

// --- Generated cases -------------------------------------------------------

export function listLiveGeneratedCases(
  params: { ticketKey?: string } = {},
): Promise<LiveGeneratedCases[]> {
  const qs = params.ticketKey
    ? `?ticket_key=${encodeURIComponent(params.ticketKey)}`
    : "";
  return jfetch(`/live/generated-cases${qs}`);
}

export interface CreateLiveGeneratedCasesBody {
  ticket_key: string;
  board_id?: string | null;
  instructions?: string;
  cases?: unknown[];
  context_metadata?: Record<string, unknown> | null;
  export_metadata?: Record<string, unknown> | null;
  status?: LiveGeneratedCasesStatus;
}

export function createLiveGeneratedCases(
  body: CreateLiveGeneratedCasesBody,
): Promise<LiveGeneratedCases> {
  return jfetch("/live/generated-cases", {
    method: "POST",
    body: JSON.stringify({
      ticket_key: body.ticket_key,
      board_id: body.board_id ?? null,
      instructions: body.instructions ?? "",
      cases: body.cases ?? [],
      context_metadata: body.context_metadata ?? null,
      export_metadata: body.export_metadata ?? null,
      status: body.status ?? "draft",
    }),
  });
}

export interface PatchLiveGeneratedCasesBody {
  instructions?: string;
  cases?: unknown[];
  context_metadata?: Record<string, unknown> | null;
  export_metadata?: Record<string, unknown> | null;
  status?: LiveGeneratedCasesStatus;
  exported_at?: string;
}

export function patchLiveGeneratedCases(
  id: string,
  patch: PatchLiveGeneratedCasesBody,
): Promise<LiveGeneratedCases> {
  return jfetch(`/live/generated-cases/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteLiveGeneratedCases(
  id: string,
): Promise<{ deleted: boolean }> {
  return jfetch(`/live/generated-cases/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Activity feed ---------------------------------------------------------

export function listLiveActivity(
  params: { boardId?: string; limit?: number } = {},
): Promise<LiveActivityEvent[]> {
  const qs = new URLSearchParams();
  if (params.boardId) qs.set("board_id", params.boardId);
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));
  const tail = qs.toString();
  return jfetch(`/live/activity${tail ? `?${tail}` : ""}`);
}

export interface CreateLiveActivityBody {
  kind: LiveActivityKind;
  summary: string;
  detail?: string;
  board_id?: string | null;
  ticket_key?: string | null;
}

export function createLiveActivity(
  body: CreateLiveActivityBody,
): Promise<LiveActivityEvent> {
  return jfetch("/live/activity", {
    method: "POST",
    body: JSON.stringify({
      kind: body.kind,
      summary: body.summary,
      detail: body.detail ?? "",
      board_id: body.board_id ?? null,
      ticket_key: body.ticket_key ?? null,
    }),
  });
}

export function clearLiveActivity(
  params: { boardId?: string } = {},
): Promise<{ deleted: number }> {
  const qs = params.boardId ? `?board_id=${encodeURIComponent(params.boardId)}` : "";
  return jfetch(`/live/activity${qs}`, { method: "DELETE" });
}
