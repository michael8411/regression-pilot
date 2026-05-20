export function encodeTestCaseRef(sessionId: string, index: number): string {
  return `${sessionId}:${index}`;
}

export function decodeTestCaseRef(
  ref: string,
): { sessionId: string; index: number } | null {
  const colon = ref.indexOf(":");
  if (colon <= 0 || colon === ref.length - 1) return null;
  const sid = ref.slice(0, colon);
  const idxStr = ref.slice(colon + 1);
  if (!sid || idxStr === "") return null;
  const idx = Number(idxStr);
  if (!Number.isFinite(idx) || !Number.isInteger(idx) || idx < 0) return null;
  return { sessionId: sid, index: idx };
}

export function isLikelyJiraKey(s: string): boolean {
  return /^[A-Z][A-Z0-9]+-\d+$/.test(s.trim());
}

export interface McpToolRef {
  connection_id: string;
  tool: string;
}

export function encodeToolRef(ref: McpToolRef): string {
  return `mcp_tool:${ref.connection_id}:${ref.tool}`;
}

export function decodeToolRef(raw: string): McpToolRef | null {
  // Format: mcp_tool:<connectionId>:<toolName>
  // Tool names may contain ":" so we split into 3 parts max.
  const idx1 = raw.indexOf(":");
  if (idx1 < 0) return null;
  const idx2 = raw.indexOf(":", idx1 + 1);
  if (idx2 < 0) return null;
  const kind = raw.slice(0, idx1);
  const connection_id = raw.slice(idx1 + 1, idx2);
  const tool = raw.slice(idx2 + 1);
  if (kind !== "mcp_tool" || !connection_id || !tool) return null;
  return { connection_id, tool };
}
