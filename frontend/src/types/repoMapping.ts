export type RepoPlatform = "github" | "azure_devops";

export interface RepoMapping {
  id: string;
  jira_project: string;
  platform: RepoPlatform;
  org: string;
  repo: string;
  ado_project: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepoMappingCreate {
  jira_project: string;
  platform: RepoPlatform;
  org?: string;
  repo?: string;
  ado_project?: string | null;
}

export interface RepoMappingUpdate {
  platform?: RepoPlatform;
  org?: string;
  repo?: string;
  ado_project?: string | null;
}
