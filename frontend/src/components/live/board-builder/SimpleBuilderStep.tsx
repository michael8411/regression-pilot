import { useEffect, useState } from "react";
import { clsx } from "clsx";
import type { LiveBoardAssigneeScope } from "@/types/live";
import {
  listJiraProjectsForLive,
  listJiraVersionsForLive,
} from "@/components/live/lib/api";
import { AUTO_LANE_GROUPING, type LaneGroupingOption } from "./lib/defaultBoardProfile";
import {
  useProjectStatuses,
  type ProjectStatus,
} from "./hooks/useProjectStatuses";
import { classifyStatus, type QaBucket } from "@/components/live/lib/statusTaxonomy";
import type { JiraProject, JiraVersion } from "@/types";

export interface SimpleBuilderValue {
  name: string;
  projectKey: string;
  versionName: string;
  selectedStatuses: string[];
  assigneeScope: LiveBoardAssigneeScope;
  laneGrouping: LaneGroupingOption;
  refreshIntervalSec: number;
  pinned: boolean;
  components: string[];
}

interface Props {
  value: SimpleBuilderValue;
  componentOptions?: string[];
  onChange: (next: Partial<SimpleBuilderValue>) => void;
  /** When provided, render statuses from this discovery hook output. */
  projectStatuses?: ReadonlyArray<ProjectStatus>;
  projectStatusesLoading?: boolean;
  projectStatusesError?: string | null;
  onProjectStatusesRetry?: () => void;
}

const LANES: { id: LaneGroupingOption; label: string }[] = [
  { id: AUTO_LANE_GROUPING, label: "Auto" },
  { id: "none", label: "None" },
  { id: "epic", label: "Epic" },
  { id: "parent", label: "Parent" },
  { id: "component", label: "Component" },
];

const REFRESH_OPTIONS: { sec: number; label: string }[] = [
  { sec: 30, label: "30s" },
  { sec: 60, label: "1m" },
  { sec: 300, label: "5m" },
  { sec: 900, label: "15m" },
];

const MAX_COMPONENTS = 3;

type GroupKey = "ready" | "testing" | "done" | "other";
const GROUP_LABELS: Record<GroupKey, string> = {
  ready: "Ready",
  testing: "Testing",
  done: "Done",
  other: "Other",
};

function groupKey(status: ProjectStatus): GroupKey {
  const bucket: QaBucket = classifyStatus(status.name);
  if (bucket !== "other") return bucket;
  if (status.category === "done") return "done";
  return "other";
}

export function SimpleBuilderStep({
  value,
  componentOptions,
  onChange,
  projectStatuses,
  projectStatusesLoading,
  projectStatusesError,
  onProjectStatusesRetry,
}: Props) {
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [versions, setVersions] = useState<JiraVersion[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // Fallback hook for callers (legacy) that don't pass projectStatuses in.
  const localHook = useProjectStatuses(
    projectStatuses === undefined ? value.projectKey || null : null,
  );
  const statuses = projectStatuses ?? localHook.statuses;
  const statusesLoading =
    projectStatusesLoading ?? (projectStatuses === undefined && localHook.loading);
  const statusesError =
    projectStatusesError ?? (projectStatuses === undefined ? localHook.error : null);
  const onRetry =
    onProjectStatusesRetry ??
    (projectStatuses === undefined ? localHook.retry : () => {});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listJiraProjectsForLive();
        if (!cancelled) setProjects(list);
      } catch (e: any) {
        if (!cancelled) {
          setProjectsError(e?.message ?? "Failed to load projects");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!value.projectKey) {
      setVersions([]);
      return;
    }
    void (async () => {
      try {
        const list = await listJiraVersionsForLive(value.projectKey);
        if (!cancelled) setVersions(list);
      } catch {
        if (!cancelled) setVersions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value.projectKey]);

  const toggleStatus = (s: string) => {
    const next = new Set(value.selectedStatuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onChange({ selectedStatuses: Array.from(next) });
  };

  const toggleComponent = (c: string) => {
    const set = new Set(value.components ?? []);
    if (set.has(c)) {
      set.delete(c);
    } else if (set.size < MAX_COMPONENTS) {
      set.add(c);
    }
    onChange({ components: Array.from(set) });
  };

  const showComponents = !!componentOptions && componentOptions.length > 0;

  const grouped: Record<GroupKey, ProjectStatus[]> = {
    ready: [],
    testing: [],
    done: [],
    other: [],
  };
  for (const s of statuses) grouped[groupKey(s)].push(s);

  const projectName =
    projects.find((p) => p.key === value.projectKey)?.key || value.projectKey;
  const selectedCount = value.selectedStatuses.length;
  const totalCount = statuses.length;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Board name">
        <input
          autoFocus
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="g-input w-full text-[12.5px]"
          placeholder="FM • 25.7"
          spellCheck={false}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Project">
          <select
            value={value.projectKey}
            onChange={(e) =>
              onChange({ projectKey: e.target.value, versionName: "" })
            }
            className="g-input w-full text-[12.5px]"
          >
            {projects.length === 0 && (
              <option value={value.projectKey}>
                {value.projectKey || "Loading…"}
              </option>
            )}
            {projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key} — {p.name}
              </option>
            ))}
          </select>
          {projectsError && (
            <p className="mt-1 text-[10.5px] text-err">{projectsError}</p>
          )}
        </Field>
        <Field label="Version (optional)">
          <select
            value={value.versionName}
            onChange={(e) => onChange({ versionName: e.target.value })}
            className="g-input w-full text-[12.5px]"
          >
            <option value="">— any —</option>
            {versions.map((v) => (
              <option key={v.id} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10.5px] text-ink-faint">
            Pick a version to keep this board focused.
          </p>
        </Field>
      </div>

      {showComponents && (
        <Field label="Components (optional)">
          <div className="flex flex-wrap gap-1.5">
            {(componentOptions ?? []).map((c) => {
              const on = (value.components ?? []).includes(c);
              const disabled =
                !on && (value.components ?? []).length >= MAX_COMPONENTS;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleComponent(c)}
                  aria-pressed={on}
                  disabled={disabled}
                  className={clsx(
                    "h-7 px-2.5 rounded-full text-[11.5px] border transition-colors disabled:opacity-40",
                    on
                      ? "bg-accent-dim text-accent-text border-accent/[0.3]"
                      : "bg-surface-elevated text-ink-muted border-subtle hover:text-ink hover:border-muted",
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10.5px] text-ink-faint">
            AND-joined into the board JQL. Max {MAX_COMPONENTS}.
          </p>
        </Field>
      )}

      <Field label="Statuses to track">
        {!value.projectKey ? (
          <p className="text-[11px] text-ink-faint">
            Pick a project to see its real statuses.
          </p>
        ) : statusesError ? (
          <div className="flex items-center justify-between rounded-md border border-err/30 bg-err/10 px-2.5 py-1.5">
            <span className="text-[11px] text-err truncate">
              {statusesError}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="g-btn text-[11px] px-2 py-1 ml-2"
            >
              Retry
            </button>
          </div>
        ) : statusesLoading && statuses.length === 0 ? (
          <p className="text-[11px] text-ink-faint">Loading workflow…</p>
        ) : statuses.length === 0 ? (
          <p className="text-[11px] text-ink-faint">
            This project's workflow returned no statuses.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {(["ready", "testing", "done", "other"] as GroupKey[]).map((g) =>
              grouped[g].length === 0 ? null : (
                <div key={g}>
                  <span className="block text-[10px] uppercase tracking-wider text-ink-faint font-mono mb-1">
                    {GROUP_LABELS[g]}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {grouped[g].map((s) => {
                      const on = value.selectedStatuses.includes(s.name);
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => toggleStatus(s.name)}
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
        )}
        {totalCount > 0 && (
          <p className="mt-2 text-[10.5px] text-ink-faint">
            Selected {selectedCount} of {totalCount} statuses returned by{" "}
            {projectName} workflow.
          </p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Assignee">
          <div className="flex gap-1.5">
            {(
              [
                { id: "anyone", label: "Anyone" },
                { id: "currentUser", label: "Me" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({ assigneeScope: opt.id })}
                aria-pressed={value.assigneeScope === opt.id}
                className={clsx(
                  "flex-1 h-7 rounded-md text-[11.5px] border transition-colors",
                  value.assigneeScope === opt.id
                    ? "bg-accent-dim text-accent-text border-accent/[0.3]"
                    : "bg-surface-elevated text-ink-muted border-subtle hover:text-ink hover:border-muted",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Refresh">
          <select
            value={value.refreshIntervalSec}
            onChange={(e) =>
              onChange({ refreshIntervalSec: Number(e.target.value) })
            }
            className="g-input w-full text-[12.5px]"
          >
            {REFRESH_OPTIONS.map((r) => (
              <option key={r.sec} value={r.sec}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Lane grouping">
        <div className="flex flex-wrap gap-1.5">
          {LANES.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onChange({ laneGrouping: l.id })}
              aria-pressed={value.laneGrouping === l.id}
              className={clsx(
                "h-7 px-2.5 rounded-full text-[11.5px] border transition-colors",
                value.laneGrouping === l.id
                  ? "bg-accent-dim text-accent-text border-accent/[0.3]"
                  : "bg-surface-elevated text-ink-muted border-subtle hover:text-ink hover:border-muted",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10.5px] text-ink-faint">
          Group tickets into rows for multi-team boards. Auto picks Epic when
          the board is broad.
        </p>
      </Field>

      <label className="flex items-center gap-2 text-[12px] text-ink select-none">
        <input
          type="checkbox"
          checked={value.pinned}
          onChange={(e) => onChange({ pinned: e.target.checked })}
        />
        Pin this board to the top of Live home
      </label>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11.5px] text-ink-muted mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}
