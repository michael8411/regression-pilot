import type { QaStatusOverride } from "@/components/live/lib/statusTaxonomy";
import type { LiveBoardQaStatusMap } from "@/types/live";
import { resolveQaBucket, type QaCategory } from "./qaConfidence";

export interface ApplyAutoQaMapArgs {
  statuses: string[];
  current: LiveBoardQaStatusMap;
  override?: QaStatusOverride;
  projectCategoryByStatus?: Record<string, QaCategory>;
}

export interface ApplyAutoQaMapResult {
  next: LiveBoardQaStatusMap;
  changedCount: number;
  unresolved: string[];
}

type Bucket = "ready" | "testing" | "done";

function bucketOf(
  current: LiveBoardQaStatusMap,
  status: string,
): Bucket | null {
  if (current.ready.includes(status)) return "ready";
  if (current.testing.includes(status)) return "testing";
  if (current.done.includes(status)) return "done";
  return null;
}

export function applyAutoQaMap(
  args: ApplyAutoQaMapArgs,
): ApplyAutoQaMapResult {
  const selected = Array.from(new Set(args.statuses));
  const next: LiveBoardQaStatusMap = {
    ready: [...args.current.ready],
    testing: [...args.current.testing],
    done: [...args.current.done],
  };

  // Drop assignments for statuses that aren't in the selection so the
  // mapping table only reflects what the user is actually tracking.
  for (const key of ["ready", "testing", "done"] as Bucket[]) {
    next[key] = next[key].filter((s) => selected.includes(s));
  }

  const unresolved: string[] = [];
  let changedCount = 0;

  for (const status of selected) {
    if (bucketOf(next, status)) continue;
    const resolution = resolveQaBucket(
      status,
      args.projectCategoryByStatus?.[status],
      args.override,
    );
    if (resolution.bucket === "unresolved") {
      unresolved.push(status);
      continue;
    }
    next[resolution.bucket].push(status);
    changedCount += 1;
  }

  return { next, changedCount, unresolved };
}
