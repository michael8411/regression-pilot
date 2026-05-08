/**
 * Settings-specific API additions (Phase 11).
 *
 * Existing endpoints (`/config/status`, `/config/credentials`, `/config/preferences`,
 * `/config/test-*`) are already wrapped in `@/lib/api`. The Data & privacy pane
 * adds `/config/data/export` and `/config/data/wipe`.
 */

const BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:8000";

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
    throw new Error(`Settings request failed: ${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export interface DataExportResponse {
  version: number;
  exported_at: string;
  tables: Record<string, unknown[]>;
  config: Record<string, string>;
}

export async function exportData(): Promise<DataExportResponse> {
  return jsonOrThrow(
    await fetch(`${BASE}/config/data/export`, { method: "POST" }),
  );
}

export async function wipeData(args: {
  confirmation: string;
  keepCredentials: boolean;
}): Promise<{ ok: boolean; credentials_cleared: number }> {
  return jsonOrThrow(
    await fetch(`${BASE}/config/data/wipe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    }),
  );
}

/** Lightweight retention counts for the Data & privacy pane. */
export async function fetchRetentionCounts(): Promise<{
  conversations: number;
  liveBoards: number;
  cycles: number;
  mcpConnections: number;
  sessions: number;
}> {
  // Reuse existing list endpoints; ignore individual failures so the panel
  // can still render partial data.
  async function safeCount(path: string): Promise<number> {
    try {
      const res = await fetch(`${BASE}${path}`);
      if (!res.ok) return 0;
      const body = await res.json();
      return Array.isArray(body) ? body.length : 0;
    } catch {
      return 0;
    }
  }
  const [conversations, liveBoards, cycles, mcpConnections, sessions] =
    await Promise.all([
      safeCount("/conversations"),
      safeCount("/live/boards"),
      safeCount("/cycles"),
      safeCount("/mcp/connections"),
      safeCount("/sessions"),
    ]);
  return { conversations, liveBoards, cycles, mcpConnections, sessions };
}
