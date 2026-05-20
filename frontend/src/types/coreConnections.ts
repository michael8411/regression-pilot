export type CoreServiceId = "jira" | "github" | "ado";
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

export interface CoreConnectionsStatus {
  jira: JiraStatus;
  github: GithubStatus;
  ado: AdoStatus;
  gemini: { configured: boolean };
  zephyr: { configured: boolean };
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
