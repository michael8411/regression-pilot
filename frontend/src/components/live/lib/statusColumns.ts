import type { JiraTicket } from "@/types";

export const DEFAULT_COLUMNS = ["To Do", "In Progress", "In Review", "Done"];

/**
 * Build the full column list, including statuses present in tickets but not
 * in the board's configured columns (rendered after the configured ones).
 * Empty extra columns are hidden.
 */
export function resolveColumns(
  configured: string[],
  byStatus: Record<string, JiraTicket[]>,
): string[] {
  const set = new Set(configured);
  const extras: string[] = [];
  for (const status of Object.keys(byStatus)) {
    if (!set.has(status)) extras.push(status);
  }
  const nonEmptyExtras = extras.filter((s) => (byStatus[s] ?? []).length > 0);
  return [...configured, ...nonEmptyExtras];
}

/** Sort tickets within a column. Currently key-asc. */
export function sortColumn(tickets: JiraTicket[]): JiraTicket[] {
  return [...tickets].sort((a, b) => {
    const an = parseInt(a.key.split("-")[1] || "0", 10);
    const bn = parseInt(b.key.split("-")[1] || "0", 10);
    return an - bn;
  });
}
