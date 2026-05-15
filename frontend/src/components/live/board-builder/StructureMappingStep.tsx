import { clsx } from "clsx";
import type { LiveBoardQaStatusMap } from "@/types/live";
import { classifyStatus } from "@/components/live/lib/statusTaxonomy";

interface Props {
  /** Statuses available for mapping (selected statuses + preview statuses). */
  statuses: string[];
  value: LiveBoardQaStatusMap;
  onChange: (next: LiveBoardQaStatusMap) => void;
}

type Bucket = "ready" | "testing" | "done" | "other";

const BUCKETS: { id: "ready" | "testing" | "done"; label: string }[] = [
  { id: "ready", label: "Ready" },
  { id: "testing", label: "Testing" },
  { id: "done", label: "Done" },
];

function inferBucket(map: LiveBoardQaStatusMap, status: string): Bucket {
  if (map.ready.includes(status)) return "ready";
  if (map.testing.includes(status)) return "testing";
  if (map.done.includes(status)) return "done";
  return "other";
}

function setBucket(
  map: LiveBoardQaStatusMap,
  status: string,
  bucket: Bucket,
): LiveBoardQaStatusMap {
  const stripped: LiveBoardQaStatusMap = {
    ready: map.ready.filter((s) => s !== status),
    testing: map.testing.filter((s) => s !== status),
    done: map.done.filter((s) => s !== status),
  };
  if (bucket === "ready") stripped.ready = [...stripped.ready, status];
  if (bucket === "testing") stripped.testing = [...stripped.testing, status];
  if (bucket === "done") stripped.done = [...stripped.done, status];
  return stripped;
}

export function StructureMappingStep({ statuses, value, onChange }: Props) {
  // Auto-classify any status not yet bucketed using the Phase 01 taxonomy.
  const ensureAutoMap = () => {
    let next = value;
    let dirty = false;
    for (const s of statuses) {
      if (inferBucket(next, s) !== "other") continue;
      const auto = classifyStatus(s);
      if (auto === "other") continue;
      next = setBucket(next, s, auto);
      dirty = true;
    }
    if (dirty) onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[12.5px] font-semibold text-ink">
            Structure mapping
          </h3>
          <p className="text-[11px] text-ink-muted leading-relaxed">
            Map each Jira status to a QA bucket. Defaults follow the Phase 01
            status taxonomy and you can override per row.
          </p>
        </div>
        <button
          type="button"
          onClick={ensureAutoMap}
          className="g-btn text-[11px] px-2 py-1"
        >
          Auto-map
        </button>
      </div>

      {statuses.length === 0 ? (
        <div className="rounded-md border border-dashed border-muted bg-surface-overlay/30 px-3 py-3 text-[11.5px] text-ink-muted">
          No statuses to map yet. Pick statuses in the simple step or run a
          preview to detect them from Jira.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {statuses.map((s) => {
            const current = inferBucket(value, s);
            return (
              <li
                key={s}
                className="flex items-center justify-between gap-2 rounded-md border border-subtle bg-surface-elevated px-2.5 py-1.5"
              >
                <span className="text-[12px] text-ink truncate">{s}</span>
                <div role="radiogroup" aria-label={`${s} QA bucket`} className="flex gap-1">
                  {BUCKETS.map((b) => {
                    const on = current === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(setBucket(value, s, b.id))}
                        className={clsx(
                          "h-6 px-2 rounded text-[10.5px] border transition-colors",
                          on
                            ? "bg-accent-dim text-accent-text border-accent/[0.3]"
                            : "bg-surface-overlay text-ink-muted border-subtle hover:text-ink hover:border-muted",
                        )}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => onChange(setBucket(value, s, "other"))}
                    aria-pressed={current === "other"}
                    className={clsx(
                      "h-6 px-2 rounded text-[10.5px] border transition-colors",
                      current === "other"
                        ? "bg-surface-overlay text-ink border-muted"
                        : "bg-transparent text-ink-faint border-transparent hover:text-ink hover:border-subtle",
                    )}
                    title="Exclude from QA buckets"
                  >
                    —
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
