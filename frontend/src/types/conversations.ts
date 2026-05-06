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

export type AttachmentKind = "ticket" | "test_case" | "session_ref";

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

export interface ToolCallPayload {
  tool: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: "requested" | "running" | "done" | "error";
  error?: string;
}
