import type {
  Cycle,
  CycleCreate,
  CyclePatch,
  CycleRun,
  CycleRunRequest,
  CycleSummary,
} from "@/types/cycles";
import { apiUrl } from "@/lib/http";

const BASE = apiUrl("/cycles");

async function safeDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.detail === "string" ? body.detail : "unknown_error";
  } catch {
    return "unknown_error";
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await safeDetail(res);
    throw new Error(`Cycles request failed: ${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function listCycles(
  includeArchived = false,
): Promise<CycleSummary[]> {
  const q = includeArchived ? "?includeArchived=true" : "";
  return jsonOrThrow(await fetch(`${BASE}${q}`));
}

export async function getCycle(id: string): Promise<Cycle> {
  return jsonOrThrow(await fetch(`${BASE}/${encodeURIComponent(id)}`));
}

export async function createCycle(input: CycleCreate): Promise<Cycle> {
  return jsonOrThrow(
    await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function patchCycle(
  id: string,
  patch: CyclePatch,
): Promise<Cycle> {
  return jsonOrThrow(
    await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteCycle(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Cycle delete failed: ${res.status}`);
}

export async function duplicateCycle(id: string): Promise<Cycle> {
  return jsonOrThrow(
    await fetch(`${BASE}/${encodeURIComponent(id)}/duplicate`, {
      method: "POST",
    }),
  );
}

export async function runCycle(
  id: string,
  body: CycleRunRequest = {},
): Promise<CycleRun> {
  return jsonOrThrow(
    await fetch(`${BASE}/${encodeURIComponent(id)}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function listRuns(id: string): Promise<CycleRun[]> {
  return jsonOrThrow(
    await fetch(`${BASE}/${encodeURIComponent(id)}/runs`),
  );
}
