import type {
  AdoConnectionPayload,
  CoreConnectionsStatus,
  CoreServiceId,
  GithubConnectionPayload,
  JiraConnectionPayload,
  TestResult,
} from "@/types/coreConnections";

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

export function getCoreConnectionsStatus() {
  return request<CoreConnectionsStatus>("/config/status");
}

export function saveJiraCredentials(payload: JiraConnectionPayload) {
  return request<{ updated: string[] }>("/config/credentials", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveGithubCredentials(payload: GithubConnectionPayload) {
  return request<{ updated: string[] }>("/config/credentials", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveAdoCredentials(payload: AdoConnectionPayload) {
  return request<{ updated: string[] }>("/config/credentials", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function disconnectService(service: CoreServiceId | "gemini" | "zephyr") {
  return request<{ service: string; cleared: string[] }>("/config/disconnect", {
    method: "POST",
    body: JSON.stringify({ service }),
  });
}

export function testJira() {
  return request<TestResult>("/config/test-jira");
}

export function testGithub() {
  return request<TestResult>("/config/test-github");
}

export function testAdo() {
  return request<TestResult>("/config/test-ado");
}

export function listGithubRepos() {
  return request<{ repos: string[] }>("/config/github/repos");
}

export function listAdoRepos() {
  return request<{ repos: string[] }>("/config/ado/repos");
}
