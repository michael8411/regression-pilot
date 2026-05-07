import type {
  McpConnection,
  McpInvokeRequest,
  McpInvokeResponse,
  McpTestResult,
  McpTool,
} from "@/types/mcp";

const ROOT =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:8000";
const BASE = `${ROOT}/mcp/connections`;

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
    throw new Error(`MCP request failed: ${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function listConnections(): Promise<McpConnection[]> {
  return jsonOrThrow(await fetch(BASE));
}

export async function getConnection(id: string): Promise<McpConnection> {
  return jsonOrThrow(await fetch(`${BASE}/${encodeURIComponent(id)}`));
}

export async function createConnection(input: {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  autoApprove?: string[];
}): Promise<McpConnection> {
  return jsonOrThrow(
    await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function patchConnection(
  id: string,
  patch: Partial<{
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    enabled: boolean;
    autoApprove: string[];
  }>,
): Promise<McpConnection> {
  return jsonOrThrow(
    await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteConnection(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`MCP delete failed: ${res.status}`);
}

export async function testConnection(id: string): Promise<McpTestResult> {
  return jsonOrThrow(
    await fetch(`${BASE}/${encodeURIComponent(id)}/test`, { method: "POST" }),
  );
}

export async function listTools(
  id: string,
  refresh = false,
): Promise<McpTool[]> {
  const url = refresh
    ? `${BASE}/${encodeURIComponent(id)}/tools?refresh=true`
    : `${BASE}/${encodeURIComponent(id)}/tools`;
  return jsonOrThrow(await fetch(url));
}

export async function invokeTool(
  connectionId: string,
  toolName: string,
  request: McpInvokeRequest,
): Promise<McpInvokeResponse> {
  return jsonOrThrow(
    await fetch(
      `${BASE}/${encodeURIComponent(connectionId)}/tools/${encodeURIComponent(toolName)}/invoke`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      },
    ),
  );
}
