export interface JqlPreset {
  id: string;
  label: string;
  description: string;
  /** Either a static JQL or a fn that takes a project key. */
  build: string | ((projectKey: string) => string);
}

export const JQL_PRESETS: JqlPreset[] = [
  {
    id: "in-flight",
    label: "Tickets in flight",
    description: "Tickets currently In Progress or In Review.",
    build: (p) => `project = ${p} AND status in ("In Progress", "In Review")`,
  },
  {
    id: "ready-for-qa",
    label: "Ready for QA",
    description: "Tickets in QA-related statuses.",
    build: (p) =>
      `project = ${p} AND status in ("In Review", "Ready for QA", "Testing")`,
  },
  {
    id: "assigned-to-me",
    label: "Assigned to me",
    description: "Tickets currently assigned to you across all projects.",
    build: "assignee = currentUser() AND resolution = Unresolved",
  },
  {
    id: "recently-updated",
    label: "Recently updated",
    description: "Anything updated in the last 7 days.",
    build: (p) => `project = ${p} AND updated >= -7d`,
  },
];

export function applyPreset(preset: JqlPreset, projectKey: string): string {
  return typeof preset.build === "string"
    ? preset.build
    : preset.build(projectKey);
}

/** Bare-minimum sanity check before POSTing. */
export function isValidJql(jql: string): boolean {
  const trimmed = jql.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 2000) return false;
  return true;
}
