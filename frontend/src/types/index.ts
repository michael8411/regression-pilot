export interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatar_url: string;
}

export interface JiraVersion {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  released: boolean;
  start_date: string | null;
  release_date: string | null;
  overdue: boolean;
  project_id: number;
}

export interface JiraTicket {
  key: string;
  id: string;
  summary: string;
  status: string;
  issue_type: string;
  priority: string;
  assignee: string;
  reporter: string;
  labels: string[];
  components: string[];
  fix_versions: string[];
  resolution: string;
  created: string;
  updated: string;
  description: string;
  comments: JiraComment[];
}

export interface JiraComment {
  author: string;
  created: string;
  body: string;
}

export interface TestStep {
  step_number: number;
  action: string;
  expected_result: string;
  test_data?: string;
}

export interface TestCase {
  name: string;
  objective: string;
  preconditions: string[];
  priority: "Critical" | "High" | "Medium" | "Low";
  labels: string[];
  steps: TestStep[];
}

export interface GeneratedTestCases {
  test_cases: TestCase[];
  error?: string;
}

export interface TicketGroup {
  name: string;
  confidence: number;
  ticket_keys: string[];
}

export interface GroupTicketsResponse {
  groups: TicketGroup[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

export type AppView = "setup" | "select" | "generate" | "review" | "chat";

export interface ConfigStatus {
  jira: {
    configured: boolean;
    base_url: string | null;
    email: string | null;
  };
  ai: { configured: boolean };
  zephyr: { configured: boolean };
}

export interface ZephyrFolder {
  id: number;
  name: string;
  parentId: number | null;
}

export interface PushResult {
  created: number;
  test_cases: any[];
  partial_failure?: boolean;
  failed_count?: number;
  failed?: { name: string; error: string }[];
}

export interface Preferences {
  theme: "dark" | "light" | "system";
  project_scope: string[];
  default_version_status: "unreleased" | "released" | "all";
  auto_select_tickets: boolean;
  default_zephyr_folder: number | null;
  ai_model: string;
  ai_temperature: number;
  export_format: "json" | "csv" | "markdown";
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
  display_name?: string;
  email?: string;
  model?: string;
}

export interface CredentialsPayload {
  jira_base_url?: string;
  jira_email?: string;
  jira_api_token?: string;
  gemini_api_key?: string;
  zephyr_api_token?: string;
}

export interface Session {
  id: string;
  project_key: string;
  version_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  state: Record<string, any>;
}

export interface SaveStateRequest {
  key?: string;
  value?: any;
  items?: Record<string, any>;
}

export interface SaveStateResponse {
  saved: boolean;
  secret_scan_warnings?: { pattern_name: string }[];
}


