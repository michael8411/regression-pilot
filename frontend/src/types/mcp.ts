export interface McpConnection {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  envKeys: string[];
  enabled: boolean;
  autoApprove: string[];
  status: "idle" | "running" | "error";
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpTestResult {
  ok: boolean;
  toolCount: number;
  duration_ms: number;
  error?: string;
}

export interface McpInvokeRequest {
  requestId: string;
  input: unknown;
}

export interface McpInvokeResponse {
  ok: boolean;
  output?: unknown;
  error?: string;
  duration_ms: number;
}

export type McpStatus = McpConnection["status"];
