/**
 * API client for the Regression Pilot backend.
 * All HTTP calls to FastAPI go through here.
 */

import type {
  JiraProject,
  JiraVersion,
  JiraTicket,
  GeneratedTestCases,
  GroupTicketsResponse,
  ConfigStatus,
  ChatMessage,
  ZephyrFolder,
  PushResult,
} from "@/types";

const BASE = "http://127.0.0.1:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(body.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function getHealth() {
  return request<{ status: string; jira_configured: boolean; ai_configured: boolean }>("/health");
}

export async function getConfigStatus() {
  return request<ConfigStatus>("/config/status");
}

export async function getProjects() {
  return request<JiraProject[]>("/jira/projects");
}

export async function getVersions(projectKey: string, status = "unreleased") {
  return request<JiraVersion[]>(
    `/jira/projects/${projectKey}/versions?status=${status}`
  );
}

export async function getTickets(fixVersion: string) {
  return request<JiraTicket[]>(
    `/jira/tickets?fix_version=${encodeURIComponent(fixVersion)}`
  );
}

export async function getTicketsByKeys(keys: string[]) {
  return request<JiraTicket[]>("/jira/tickets/by-keys", {
    method: "POST",
    body: JSON.stringify({ keys }),
  });
}

export async function generateTestCases(
  tickets: JiraTicket[],
  instructions = ""
) {
  return request<GeneratedTestCases>("/ai/generate", {
    method: "POST",
    body: JSON.stringify({ tickets, instructions }),
  });
}

export async function groupTickets(tickets: JiraTicket[]) {
  return request<GroupTicketsResponse>("/ai/group-tickets", {
    method: "POST",
    body: JSON.stringify({ tickets }),
  });
}

export async function sendChatMessage(
  messages: ChatMessage[],
  tickets?: JiraTicket[]
) {
  return request<{ response: string }>("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ messages, tickets }),
  });
}

/**
 * Stream a chat response via SSE.
 * Yields text chunks as they arrive.
 */
export async function* streamChatMessage(
  messages: ChatMessage[],
  tickets?: JiraTicket[]
): AsyncGenerator<string> {
  const resp = await fetch(`${BASE}/ai/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, tickets }),
  });

  if (!resp.ok || !resp.body) {
    throw new Error(`Stream error: ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        if (data.error) throw new Error(data.error);
        if (data.done) return;
        if (data.text) yield data.text;
      }
    }
  }
}

export async function getZephyrFolders(projectKey: string) {
  return request<ZephyrFolder[]>(`/zephyr/folders/${projectKey}`);
}

export async function pushTestCases(
  projectKey: string,
  testCases: any[],
  folderId?: number
) {
  return request<PushResult>("/zephyr/push", {
    method: "POST",
    body: JSON.stringify({
      project_key: projectKey,
      test_cases: testCases,
      folder_id: folderId,
    }),
  });
}
