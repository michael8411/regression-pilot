import {
  DEFAULT_DONE_STATUSES,
} from "./defaultBoardProfile";

export interface SimpleJqlInput {
  projectKey: string;
  versionName?: string;
  components?: string[];
  selectedStatuses?: string[];
  assigneeScope?: "anyone" | "currentUser";
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function inList(values: string[]): string {
  return `(${values.map(quote).join(", ")})`;
}

export function buildSimpleJql(input: SimpleJqlInput): string {
  const parts: string[] = [];

  const project = (input.projectKey || "").trim();
  if (project) parts.push(`project = ${quote(project)}`);

  const version = (input.versionName || "").trim();
  if (version) parts.push(`fixVersion = ${quote(version)}`);

  const components = (input.components ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  if (components.length > 0) {
    parts.push(`component in ${inList(components)}`);
  }

  if (input.assigneeScope === "currentUser") {
    parts.push("assignee = currentUser()");
  }

  const selected = (input.selectedStatuses ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  if (selected.length > 0) {
    parts.push(`status in ${inList(selected)}`);
  } else {
    // Default: active work plus the done-family the user usually wants to see.
    const doneList = inList([...DEFAULT_DONE_STATUSES]);
    parts.push(`(statusCategory != "Done" OR status in ${doneList})`);
  }

  return `${parts.join(" AND ")} ORDER BY updated DESC`;
}
