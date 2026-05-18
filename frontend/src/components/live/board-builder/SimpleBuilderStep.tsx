import { useEffect, useState } from "react";
import { clsx } from "clsx";
import type { LiveBoardAssigneeScope } from "@/types/live";
import {
  listJiraProjectsForLive,
  listJiraVersionsForLive,
} from "@/components/live/lib/api";
import {
  AUTO_LANE_GROUPING,
  DEFAULT_STATUS_OPTIONS,
  type LaneGroupingOption,
} from "./lib/defaultBoardProfile";
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
  /** Status options to choose from (detected via preview when available). */
  statusOptions: string[];
  /** Optional component names; section hidden when empty. */
  componentOptions?: string[];
  onChange: (next: Partial<SimpleBuilderValue>) => void;
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

export function SimpleBuilderStep({
  value,
  statusOptions,
  componentOptions,
  onChange,
}: Props) {
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [versions, setVersions] = useState<JiraVersion[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);

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

  const options =
    statusOptions.length > 0 ? statusOptions : [...DEFAULT_STATUS_OPTIONS];

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
        <div className="flex flex-wrap gap-1.5">
          {options.map((s) => {
            const on = value.selectedStatuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={on}
                className={clsx(
                  "h-7 px-2.5 rounded-full text-[11.5px] border transition-colors",
                  on
                    ? "bg-accent-dim text-accent-text border-accent/[0.3]"
                    : "bg-surface-elevated text-ink-muted border-subtle hover:text-ink hover:border-muted",
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[10.5px] text-ink-faint">
          Pick the Jira statuses this board should show. Defaults are
          QA-focused.
        </p>
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
