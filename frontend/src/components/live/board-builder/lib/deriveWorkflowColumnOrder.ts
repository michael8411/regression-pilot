/**
 * Layer 1 — Workflow Columns: derive the authoritative L→R column order.
 *
 * The backend's `workflow_column_order` (first-seen status discovery)
 * is the preferred source when present. When absent — older backend or
 * test fixture — we bucket statuses by category (`new` → `indeterminate`
 * → `done`) and within each bucket apply a fixed name priority so common
 * workflows (To Do → In Dev → Review → Test → Done) render in the
 * canonical reading order.
 *
 * Notes:
 *   - All name matching is case-insensitive (`includes`-based) so Jira
 *     variants like `"IN DEVELOPMENT"`, `"In Dev"`, and `"DEV"` collapse
 *     onto the same slot.
 *   - Unmatched names within a bucket sort alphabetically after matched
 *     ones, so ordering stays stable as new statuses appear.
 *   - Duplicates are removed (first occurrence wins).
 */

import type { ProjectStatus } from "../hooks/useProjectStatuses";

/**
 * Fixed L→R slot order within each category bucket. The matchers are
 * case-insensitive substrings against the Jira status name.
 */
interface NameSlot {
  /** Lowercase substrings; the first match wins. */
  match: string[];
}

const TODO_SLOT: NameSlot = { match: ["to do", "open", "backlog"] };
const IN_DEV_SLOT: NameSlot = { match: ["in development", "in dev", "dev"] };
const READY_REVIEW_SLOT: NameSlot = { match: ["ready for review", "ready review"] };
const IN_REVIEW_SLOT: NameSlot = { match: ["code review", "in review", "review"] };
const READY_TEST_SLOT: NameSlot = {
  match: ["ready to test", "ready for qa", "ready for test", "qa ready"],
};
const IN_TEST_SLOT: NameSlot = {
  match: ["in testing", "testing", "qa in progress", "qa testing"],
};
const DONE_SLOT: NameSlot = { match: ["done", "closed", "resolved", "completed"] };

/** Per-bucket ordered slot lists. */
const NEW_SLOTS: NameSlot[] = [TODO_SLOT];
const INDETERMINATE_SLOTS: NameSlot[] = [
  IN_DEV_SLOT,
  READY_REVIEW_SLOT,
  IN_REVIEW_SLOT,
  READY_TEST_SLOT,
  IN_TEST_SLOT,
];
const DONE_SLOTS: NameSlot[] = [DONE_SLOT];

function slotIndex(name: string, slots: NameSlot[]): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].match.some((s) => lower.includes(s))) return i;
  }
  return Number.MAX_SAFE_INTEGER;
}

function dedupePreservingOrder(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of input) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Heuristic ordering used when the backend doesn't supply
 * `workflow_column_order`. Buckets by category then by per-bucket slot
 * priority; unmatched names trail alphabetically within the bucket.
 */
function deriveHeuristicOrder(statuses: ReadonlyArray<ProjectStatus>): string[] {
  const byCategory = {
    new: [] as ProjectStatus[],
    indeterminate: [] as ProjectStatus[],
    done: [] as ProjectStatus[],
  };
  for (const s of statuses) {
    byCategory[s.category].push(s);
  }

  function sortBucket(
    bucket: ProjectStatus[],
    slots: NameSlot[],
  ): ProjectStatus[] {
    return [...bucket].sort((a, b) => {
      const ai = slotIndex(a.name, slots);
      const bi = slotIndex(b.name, slots);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  }

  return [
    ...sortBucket(byCategory.new, NEW_SLOTS),
    ...sortBucket(byCategory.indeterminate, INDETERMINATE_SLOTS),
    ...sortBucket(byCategory.done, DONE_SLOTS),
  ].map((s) => s.name);
}

/**
 * Resolve the authoritative L→R workflow column order.
 *
 * @param statuses     Project statuses from `useProjectStatuses`.
 * @param serverOrder  Optional `workflow_column_order` from the API
 *                     response. When present and non-empty, it wins.
 */
export function deriveWorkflowColumnOrder(
  statuses: ReadonlyArray<ProjectStatus>,
  serverOrder?: ReadonlyArray<string>,
): string[] {
  if (serverOrder && serverOrder.length > 0) {
    // Trust the backend's first-seen discovery; just dedupe defensively.
    return dedupePreservingOrder([...serverOrder]);
  }
  return dedupePreservingOrder(deriveHeuristicOrder(statuses));
}
