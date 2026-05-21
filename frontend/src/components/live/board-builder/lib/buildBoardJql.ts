/**
 * Layer 1 PR3 — template-aware JQL builder.
 *
 * Replaces `buildSimpleJql` as the default path. The crucial difference:
 * the **workflow** template does NOT add `status in (...)` as a filter,
 * because that's what locks the board into a 3-status QA slice (the
 * "All columns toggle does nothing" bug from the old builder).
 *
 *   workflow      → `project = X` AND optional fixVersion / components /
 *                   assignee. No status filter. When no version is set, we
 *                   add `(statusCategory != Done OR status in (done family))`
 *                   so the board is bounded to active + recent work.
 *
 *   qa_release    → same project/version/components/assignee scaffolding
 *                   AND `status in (QA names)` where the QA list comes
 *                   from the profile's qaStatusMap (ready+testing+done)
 *                   or falls back to selectedStatuses for legacy callers.
 *
 * The existing `buildSimpleJql` stays so the old "Selected statuses"
 * chip UI keeps working in Advanced; new boards default to this builder.
 */

import { DEFAULT_DONE_STATUSES } from "./defaultBoardProfile";
import type { LiveBoardQaStatusMap, LiveBoardTemplate } from "@/types/live";

export interface BuildBoardJqlInput {
  template: LiveBoardTemplate;
  projectKey: string;
  versionName?: string;
  components?: ReadonlyArray<string>;
  assigneeScope?: "anyone" | "currentUser";
  /** Used by the qa_release template (ready+testing+done flattened). */
  qaStatusMap?: LiveBoardQaStatusMap;
  /**
   * Legacy fallback for qa_release: when qaStatusMap is empty, fall
   * back to a flat status list. Workflow template ignores this field.
   */
  qaStatusFallback?: ReadonlyArray<string>;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function inList(values: ReadonlyArray<string>): string {
  return `(${values.map(quote).join(", ")})`;
}

function cleanList(values: ReadonlyArray<string> | undefined): string[] {
  if (!values) return [];
  return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

function flattenQaMap(map: LiveBoardQaStatusMap | undefined): string[] {
  if (!map) return [];
  return [...map.ready, ...map.testing, ...map.done].filter(Boolean);
}

export function buildBoardJql(input: BuildBoardJqlInput): string {
  const parts: string[] = [];

  const project = (input.projectKey || "").trim();
  if (project) parts.push(`project = ${quote(project)}`);

  const version = (input.versionName || "").trim();
  if (version) parts.push(`fixVersion = ${quote(version)}`);

  const components = cleanList(input.components);
  if (components.length > 0) {
    parts.push(`component in ${inList(components)}`);
  }

  if (input.assigneeScope === "currentUser") {
    parts.push("assignee = currentUser()");
  }

  if (input.template === "qa_release") {
    // QA release board: restrict to QA statuses. Prefer the qaStatusMap;
    // fall back to the explicit list when the map hasn't been seeded yet.
    const qaList = flattenQaMap(input.qaStatusMap);
    const list = qaList.length > 0 ? qaList : cleanList(input.qaStatusFallback);
    if (list.length > 0) {
      parts.push(`status in ${inList(list)}`);
    }
  } else {
    // Workflow template: do NOT add a status filter. The full workflow
    // is the point of this template. Optionally bound the result set to
    // active + done-family when no version is pinned, so unbounded
    // historical archives don't load.
    if (!version) {
      const doneList = inList([...DEFAULT_DONE_STATUSES]);
      parts.push(`(statusCategory != "Done" OR status in ${doneList})`);
    }
  }

  return `${parts.join(" AND ")} ORDER BY updated DESC`;
}
