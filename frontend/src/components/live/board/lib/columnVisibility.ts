import {
  classifyStatus,
  type QaBucket,
  type QaStatusOverride,
} from "@/components/live/lib/statusTaxonomy";
import type { JiraTicket } from "@/types";

/**
 * Layer 1 (PR2) — render columns from `columnOrder`, not from `byStatus`.
 *
 * Previously: columns came from `Object.keys(byStatus)`, so a status with
 * zero tickets disappeared. That made "Show empty" useless and broke
 * "All columns" — the board could only ever render what Jira returned.
 *
 * Now: we walk `columnOrder` left→right and emit a column for every
 * status in that list. `byStatus` provides ticket counts. Empty columns
 * stay in place as **slim** placeholders so the workflow grid is stable.
 *
 * Orphans (statuses in `byStatus` that aren't in `columnOrder`) get
 * appended at the end in "all" mode so tickets are never hidden by a
 * stale profile. They're omitted in "qa" mode unless they happen to
 * land in a QA bucket via `classifyStatus`.
 */
export interface ResolveColumnsArgs {
  /**
   * Authoritative L→R column list. Comes from
   * `board.profile.workflowColumnOrder ?? board.columns`.
   */
  columnOrder: string[];
  /** Ticket buckets keyed by status name (from the Jira board fetch). */
  byStatus: Record<string, JiraTicket[]>;
  /**
   * `"qa"`: hide columns that don't classify into a QA bucket.
   * `"all"`: render every workflow column (subject to `showEmpty`).
   */
  mode: "qa" | "all";
  /**
   * `true`: show zero-count columns. `false`: hide zero-count non-QA
   * columns in "all" mode; QA columns in "qa" mode are kept as slim
   * placeholders regardless so the QA reading grid stays stable.
   */
  showEmpty: boolean;
  /** Optional QA mapping override from `board.profile.qaStatusMap`. */
  qaStatusOverride?: QaStatusOverride;
}

export interface ResolvedColumn {
  status: string;
  bucket: QaBucket;
  count: number;
  /** First column with at least one ticket — used for highlight styling. */
  isLeading: boolean;
}

function caseInsensitiveSet(input: ReadonlyArray<string>): Set<string> {
  return new Set(input.map((s) => s.toLowerCase()));
}

export function resolveBoardColumns(args: ResolveColumnsArgs): ResolvedColumn[] {
  const { columnOrder, byStatus, mode, showEmpty, qaStatusOverride } = args;

  // 1. Walk columnOrder in order, dedupe case-insensitively (keep first).
  const seen = new Set<string>();
  const ordered: ResolvedColumn[] = [];
  for (const status of columnOrder) {
    const key = status.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const tickets = byStatus[status] ?? [];
    ordered.push({
      status,
      bucket: classifyStatus(status, qaStatusOverride),
      count: tickets.length,
      isLeading: false,
    });
  }

  // 2. Find orphans: statuses present in byStatus but not in columnOrder.
  //    Append at the end in "all" mode so we never hide tickets behind a
  //    stale profile. In "qa" mode, only orphans that classify into a
  //    QA bucket are surfaced.
  const orderSet = caseInsensitiveSet(columnOrder);
  for (const status of Object.keys(byStatus)) {
    if (orderSet.has(status.toLowerCase())) continue;
    const bucket = classifyStatus(status, qaStatusOverride);
    if (mode === "qa" && bucket === "other") continue;
    ordered.push({
      status,
      bucket,
      count: byStatus[status]?.length ?? 0,
      isLeading: false,
    });
  }

  // 3. Mode + showEmpty filter.
  let resolved: ResolvedColumn[];
  if (mode === "qa") {
    // QA mode: drop non-QA buckets. Keep empty QA columns as slim
    // placeholders regardless of showEmpty so the reading grid stays
    // stable for QA users (matches the FM 3.2.0 mockup behavior).
    resolved = ordered.filter((c) => c.bucket !== "other");
  } else {
    // All mode: keep everything, but when showEmpty is off, hide
    // zero-count non-QA columns to avoid clutter. Empty QA columns
    // stay visible because they're meaningful even when empty.
    resolved = ordered.filter((c) => {
      if (c.count > 0) return true;
      if (showEmpty) return true;
      return c.bucket !== "other";
    });
  }

  // 4. Mark first non-empty column as leading.
  for (const col of resolved) {
    if (col.count > 0) {
      col.isLeading = true;
      break;
    }
  }

  return resolved;
}
