import { classifyStatus, type QaBucket, type QaStatusOverride } from "@/components/live/lib/statusTaxonomy";
import { QA_COLUMN_READING_ORDER } from "@/components/live/board-builder/lib/defaultBoardProfile";
import type { JiraTicket } from "@/types";

export interface ResolveColumnsArgs {
  jiraColumns: string[];
  byStatus: Record<string, JiraTicket[]>;
  mode: "qa" | "all";
  showEmptyNonQa: boolean;
  qaStatusOverride?: QaStatusOverride;
}

export interface ResolvedColumn {
  status: string;
  bucket: QaBucket;
  count: number;
  isLeading: boolean;
}

function readingOrderIndex(status: string): number {
  const i = QA_COLUMN_READING_ORDER.findIndex(
    (s) => s.toLowerCase() === status.toLowerCase(),
  );
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

export function resolveBoardColumns(args: ResolveColumnsArgs): ResolvedColumn[] {
  const { jiraColumns, byStatus, mode, showEmptyNonQa, qaStatusOverride } = args;

  // Phase 13 §2.2 — only render statuses present in the current board
  // response. Saved-profile statuses the workflow no longer returns are
  // silently dropped (no ghost columns).
  void jiraColumns;
  const knownStatuses = new Set<string>(Object.keys(byStatus));

  // Collapse synonymous statuses: keep the first canonical occurrence per
  // bucket+canonical-name pair. Two statuses are "synonyms" only when they
  // share the same canonical reading-order slot. Two distinct entries in
  // QA_COLUMN_READING_ORDER (e.g. Done vs Closed) stay as siblings.
  const seenSlot = new Map<string, string>();
  const rows: ResolvedColumn[] = [];

  for (const status of knownStatuses) {
    const bucket = classifyStatus(status, qaStatusOverride);
    const tickets = byStatus[status] ?? [];
    const slotKey = `${bucket}::${readingOrderIndex(status)}::${status.toLowerCase()}`;
    if (seenSlot.has(slotKey)) continue;
    seenSlot.set(slotKey, status);

    rows.push({
      status,
      bucket,
      count: tickets.length,
      isLeading: false,
    });
  }

  const qaRows = rows.filter((r) => r.bucket !== "other");
  const otherRows = rows.filter((r) => r.bucket === "other");

  qaRows.sort((a, b) => {
    const ia = readingOrderIndex(a.status);
    const ib = readingOrderIndex(b.status);
    if (ia !== ib) return ia - ib;
    return a.status.localeCompare(b.status);
  });
  otherRows.sort((a, b) => a.status.localeCompare(b.status));

  let resolved: ResolvedColumn[];
  if (mode === "qa") {
    resolved = qaRows;
  } else {
    const filteredOther = showEmptyNonQa
      ? otherRows
      : otherRows.filter((r) => r.count > 0);
    resolved = [...qaRows, ...filteredOther];
  }

  for (const r of resolved) {
    if (r.count > 0) {
      r.isLeading = true;
      break;
    }
  }
  return resolved;
}
