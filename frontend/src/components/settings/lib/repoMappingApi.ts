import type {
  RepoMapping,
  RepoMappingCreate,
  RepoMappingUpdate,
} from "@/types/repoMapping";
import { backendFetch } from "@/lib/backendAuth";

const BASE = "http://127.0.0.1:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await backendFetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(body.detail || `HTTP ${resp.status}`);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

export function listRepoMappings() {
  return request<RepoMapping[]>("/repo-map");
}

export function createRepoMapping(payload: RepoMappingCreate) {
  return request<RepoMapping>("/repo-map", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRepoMapping(id: string, payload: RepoMappingUpdate) {
  return request<RepoMapping>(`/repo-map/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteRepoMapping(id: string) {
  return request<{ deleted: boolean }>(`/repo-map/${id}`, {
    method: "DELETE",
  });
}
