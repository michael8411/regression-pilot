export type CoreServiceId = "jira" | "github" | "ado" | "sql_server";
export type AuthMode = "OAuth" | "PAT";

export interface JiraStatus {
  configured: boolean;
  base_url: string | null;
  email: string | null;
}

export interface GithubStatus {
  configured: boolean;
}

export interface AdoStatus {
  configured: boolean;
  org: string | null;
}

export interface SqlServerStatus {
  configured: boolean;
  database: string | null;
  schema_allowlist: string | null;
  include_procs: boolean;
}

export interface CoreConnectionsStatus {
  jira: JiraStatus;
  github: GithubStatus;
  ado: AdoStatus;
  gemini: { configured: boolean };
  zephyr: { configured: boolean };
  sql_server: SqlServerStatus;
}

export interface TestResult {
  ok: boolean;
  error?: string;
  display_name?: string;
  email?: string;
  login?: string;
  name?: string;
  org?: string;
  project_count?: number;
  model?: string;
}

export interface JiraConnectionPayload {
  jira_base_url?: string;
  jira_email?: string;
  jira_api_token?: string;
}

export interface GithubConnectionPayload {
  github_access_token?: string;
}

export interface AdoConnectionPayload {
  ado_org?: string;
  ado_access_token?: string;
}

export interface SqlServerConnectionPayload {
  sql_server_connection_string?: string;
  sql_server_database?: string;
  sql_server_schema_allowlist?: string;
  sql_server_table_allowlist?: string;
  sql_server_include_procs?: boolean;
}

export type SqlServerDiagnosticCode =
  | ""
  | "not_configured"
  | "pyodbc_missing"
  | "odbc_driver_missing"
  | "connection_failed"
  | "login_failed"
  | "database_unavailable"
  | "metadata_permission_denied"
  | "schema_allowlist_empty"
  | "table_allowlist_filtered_all"
  | "unknown_error";

export interface SqlServerDiagnostics {
  ok: boolean;
  configured: boolean;
  database: string | null;
  driver_detected: boolean;
  connection_ok: boolean;
  metadata_ok: boolean;
  accessible_schemas: string[];
  table_count: number;
  error_code: SqlServerDiagnosticCode;
  error_message: string;
}
