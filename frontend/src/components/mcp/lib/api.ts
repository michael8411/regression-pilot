import type {
  McpConnection,
  McpInvokeRequest,
  McpInvokeResponse,
  McpTestResult,
  McpTool,
  McpTransport,
} from "@/types/mcp";
import { apiUrl } from "@/lib/http";

const BASE = apiUrl("/mcp/connections");

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

async function mcpFetch(url: string, init?: RequestInit): Promise<Response> {
  return backendFetch(url, init);
}

export async function listConnections(): Promise<McpConnection[]> {
  return jsonOrThrow(await mcpFetch(BASE));
}

export async function getConnection(id: string): Promise<McpConnection> {
  return jsonOrThrow(await mcpFetch(`${BASE}/${encodeURIComponent(id)}`));
}

export async function createConnection(input: {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  autoApprove?: string[];
  transport?: McpTransport;
  url?: string;
}): Promise<McpConnection> {
  return jsonOrThrow(
    await mcpFetch(BASE, {
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
    transport: McpTransport;
    url: string;
  }>,
): Promise<McpConnection> {
  debugMcpApi("H4_API_METHOD_MISMATCH", "api patchConnection called", {
    id,
    isManaged: id.startsWith("managed-"),
    patchKeys: Object.keys(patch),
    enabled: patch.enabled,
  });
  return jsonOrThrow(
    await mcpFetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteConnection(id: string): Promise<void> {
  const res = await mcpFetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`MCP delete failed: ${res.status}`);
}

export async function testConnection(id: string): Promise<McpTestResult> {
  return jsonOrThrow(
    await mcpFetch(`${BASE}/${encodeURIComponent(id)}/test`, { method: "POST" }),
  );
}

export async function listTools(
  id: string,
  refresh = false,
): Promise<McpTool[]> {
  const url = refresh
    ? `${BASE}/${encodeURIComponent(id)}/tools?refresh=true`
    : `${BASE}/${encodeURIComponent(id)}/tools`;
  return jsonOrThrow(await mcpFetch(url));
}

export async function invokeTool(
  connectionId: string,
  toolName: string,
  request: McpInvokeRequest,
): Promise<McpInvokeResponse> {
  return jsonOrThrow(
    await mcpFetch(
      `${BASE}/${encodeURIComponent(connectionId)}/tools/${encodeURIComponent(toolName)}/invoke`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      },
    ),
  );
}
