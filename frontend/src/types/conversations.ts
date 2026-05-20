export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  archived: boolean;
  meta: Record<string, unknown>;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  meta: Record<string, unknown>;
}

export type AttachmentKind = "ticket" | "test_case" | "session_ref" | "mcp_tool";

export interface Attachment {
  id: string;
  conversation_id: string;
  kind: AttachmentKind;
  ref: string;
  created_at: string;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
  attachments: Attachment[];
}

export interface SecretScanWarning {
  pattern_name: string;
}

export interface AppendMessageResponse {
  message: Message;
  secret_scan_warnings: SecretScanWarning[];
}

export type ToolCallStatus =
  | "requested"
  | "approved"
  | "running"
  | "done"
  | "error"
  | "denied";

export interface ToolCallPayload {
  request_id: string;
  connection_id: string;
  tool: string;
  input: unknown;
  status: ToolCallStatus;
  output?: unknown;
  error?: string;
  duration_ms?: number;
}

export interface ToolCallStreamEvent {
  request_id: string;
  connection_id: string;
  tool: string;
  input: unknown;
}

export type StreamEvent =
  | { text: string }
  | { tool_call: ToolCallStreamEvent }
  | { error: string }
  | { done: true; message_id?: string };

export interface ToolAttachmentRef {
  kind: "mcp_tool";
  connection_id: string;
  tool: string;
}

export interface ToolCatalogEntry {
  connection_id: string;
  tool: string;
  description?: string;
  /** JSON Schema-shaped tool argument descriptor (Phase 4). */
  inputSchema?: Record<string, unknown> | null;
}
