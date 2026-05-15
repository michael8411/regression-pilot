import type {
  AppendMessageResponse,
  Attachment,
  AttachmentKind,
  Conversation,
  ConversationWithMessages,
  Message,
  MessageRole,
  ToolCallPayload,
  ToolCatalogEntry,
} from "@/types/conversations";

import { API_BASE, http as jfetch } from "@/lib/http";

// `BASE` retained as a local alias so the streaming-helper call site below
// (which uses `fetch` directly) keeps reading like the rest of the file.
const BASE = API_BASE;

export function listConversations(includeArchived = false): Promise<Conversation[]> {
  const q = includeArchived ? "?includeArchived=true" : "";
  return jfetch<Conversation[]>(`/conversations${q}`);
}

export function createConversation(title?: string): Promise<Conversation> {
  return jfetch<Conversation>("/conversations", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function getConversation(id: string): Promise<ConversationWithMessages> {
  return jfetch<ConversationWithMessages>(
    `/conversations/${encodeURIComponent(id)}`,
  );
}

export function patchConversation(
  id: string,
  patch: Partial<Pick<Conversation, "title" | "pinned" | "archived">>,
): Promise<Conversation> {
  return jfetch<Conversation>(`/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteConversation(id: string): Promise<{ deleted: boolean }> {
  return jfetch<{ deleted: boolean }>(`/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function appendMessage(
  id: string,
  body: { role: MessageRole; content: string; meta?: Record<string, unknown> },
): Promise<AppendMessageResponse> {
  return jfetch<AppendMessageResponse>(
    `/conversations/${encodeURIComponent(id)}/messages`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function addAttachment(
  id: string,
  body: { kind: AttachmentKind; ref: string },
): Promise<Attachment> {
  return jfetch<Attachment>(
    `/conversations/${encodeURIComponent(id)}/attachments`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function removeAttachment(
  id: string,
  aid: string,
): Promise<{ deleted: boolean }> {
  return jfetch<{ deleted: boolean }>(
    `/conversations/${encodeURIComponent(id)}/attachments/${encodeURIComponent(aid)}`,
    { method: "DELETE" },
  );
}

export function recordToolMessage(
  id: string,
  payload: ToolCallPayload,
): Promise<Message> {
  return jfetch<Message>(
    `/conversations/${encodeURIComponent(id)}/messages/tool`,
    {
      method: "POST",
      body: JSON.stringify({
        request_id: payload.request_id,
        tool: payload.tool,
        connection_id: payload.connection_id,
        status: payload.status,
        input: payload.input,
        output: payload.output,
        error: payload.error,
        duration_ms: payload.duration_ms,
      }),
    },
  );
}

/** Stream an assistant reply. Yields raw SSE event objects. */
export async function* streamAssistantReply(
  id: string,
  signal?: AbortSignal,
  options?: { tool_catalog?: ToolCatalogEntry[] },
): AsyncGenerator<{
  text?: string;
  done?: boolean;
  error?: string;
  message_id?: string;
  tool_call?: {
    request_id: string;
    connection_id: string;
    tool: string;
    input: unknown;
  };
}> {
  const body =
    options?.tool_catalog && options.tool_catalog.length > 0
      ? JSON.stringify({ tool_catalog: options.tool_catalog })
      : "{}";
  const res = await fetch(
    `${BASE}/conversations/${encodeURIComponent(id)}/messages/stream`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal,
    },
  );
  if (!res.ok || !res.body) {
    throw new Error(`Stream failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      const line = evt.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(6));
      } catch {
        // skip malformed line; do not log content
      }
    }
  }
}
