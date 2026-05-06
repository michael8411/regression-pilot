import type { JiraTicket } from "@/types";

export interface LiveBoard {
  id: string;
  name: string;
  jql: string;
  columns: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface BoardResponse {
  total: number;
  by_status: Record<string, JiraTicket[]>;
  fetched_at: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string };
}

export interface JiraCommentMeta {
  id: string;
  author: string;
  created: string;
}

export interface JiraCommentSubmitResponse {
  comment: JiraCommentMeta;
  secret_scan_warnings: { pattern_name: string }[];
}

export interface JiraTransitionResult {
  ok: boolean;
  skipped: boolean;
}
