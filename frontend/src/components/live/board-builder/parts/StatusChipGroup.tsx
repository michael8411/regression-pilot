import { clsx } from "clsx";
import { classifyStatus, type QaBucket } from "@/components/live/lib/statusTaxonomy";
import type { ProjectStatus } from "../hooks/useProjectStatuses";

type GroupKey = "ready" | "testing" | "done" | "other";

const GROUP_LABELS: Record<GroupKey, string> = {
  ready: "Ready",
  testing: "Testing",
  done: "Done",
  other: "Other",
};

interface Props {
  statuses: ReadonlyArray<ProjectStatus>;
  selected: ReadonlyArray<string>;
  loading: boolean;
  error: string | null;
  projectKey: string | null;
  onToggle: (status: string) => void;
  onRetry: () => void;
}

function groupKey(status: ProjectStatus): GroupKey {
  const bucket: QaBucket = classifyStatus(status.name);
  if (bucket !== "other") return bucket;
  if (status.category === "done") return "done";
  return "other";
}

export function StatusChipGroup({
  statuses,
  selected,
  loading,
  error,
  projectKey,
  onToggle,
  onRetry,
}: Props) {
  if (!projectKey) {
    return (
      <p className="text-[11px] text-ink-faint">
        Pick a project to see its real statuses.
      </p>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-between rounded-md border border-err/30 bg-err/10 px-2.5 py-1.5">
        <span className="text-[11px] text-err truncate">{error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="g-btn text-[11px] px-2 py-1 ml-2"
        >
          Retry
        </button>
      </div>
    );
  }
  if (loading && statuses.length === 0) {
    return <p className="text-[11px] text-ink-faint">Loading workflow…</p>;
  }
  if (statuses.length === 0) {
    return (
      <p className="text-[11px] text-ink-faint">
        This project's workflow returned no statuses.
      </p>
    );
  }

  const groups: Record<GroupKey, ProjectStatus[]> = {
    ready: [],
    testing: [],
    done: [],
    other: [],
  };
  for (const s of statuses) groups[groupKey(s)].push(s);

  return (
    <div className="flex flex-col gap-2">
      {(["ready", "testing", "done", "other"] as GroupKey[]).map((g) =>
        groups[g].length === 0 ? null : (
          <div key={g}>
            <span className="block text-[10px] uppercase tracking-wider text-ink-faint font-mono mb-1">
              {GROUP_LABELS[g]}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {groups[g].map((s) => {
                const on = selected.includes(s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => onToggle(s.name)}
                    aria-pressed={on}
                    className={clsx(
                      "h-7 px-2.5 rounded-full text-[11.5px] border transition-colors",
                      on
                        ? "bg-accent-dim text-accent-text border-accent/[0.3]"
                        : "bg-surface-elevated text-ink-muted border-subtle hover:text-ink hover:border-muted",
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
