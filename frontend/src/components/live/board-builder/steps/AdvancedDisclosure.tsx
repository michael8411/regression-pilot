import { forwardRef, useState } from "react";
import { clsx } from "clsx";
import { ChevronDown, ChevronRight, RotateCcw } from "@/lib/icons";
import { StatusChipGroup } from "../parts/StatusChipGroup";
import { QaMappingTable } from "../parts/QaMappingTable";
import {
  AUTO_LANE_GROUPING,
  type LaneGroupingOption,
} from "../lib/defaultBoardProfile";
import type { ProjectStatus } from "../hooks/useProjectStatuses";
import type {
  LiveBoardAssigneeScope,
  LiveBoardQaStatusMap,
} from "@/types/live";

interface Props {
  open: boolean;
  onToggle: () => void;

  projectKey: string;
  projectStatuses: ReadonlyArray<ProjectStatus>;
  statusesLoading: boolean;
  statusesError: string | null;
  onRetryStatuses: () => void;

  selectedStatuses: string[];
  onToggleStatus: (name: string) => void;

  qaStatusMap: LiveBoardQaStatusMap;
  qaUnresolved: ReadonlyArray<string>;
  onQaStatusMapChange: (next: LiveBoardQaStatusMap) => void;
  onAutoMap: () => void;

  laneGrouping: LaneGroupingOption;
  onLaneGroupingChange: (next: LaneGroupingOption) => void;

  componentOptions: ReadonlyArray<string>;
  components: string[];
  onComponentsChange: (next: string[]) => void;

  assigneeScope: LiveBoardAssigneeScope;
  onAssigneeScopeChange: (next: LiveBoardAssigneeScope) => void;

  refreshIntervalSec: number;
  onRefreshIntervalChange: (next: number) => void;

  effectiveJql: string;
  autoJql: string;
  customJql: boolean;
  onJqlChange: (jql: string, isCustom: boolean) => void;
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

export const AdvancedDisclosure = forwardRef<HTMLDivElement, Props>(
  function AdvancedDisclosure(
    {
      open,
      onToggle,
      projectKey,
      projectStatuses,
      statusesLoading,
      statusesError,
      onRetryStatuses,
      selectedStatuses,
      onToggleStatus,
      qaStatusMap,
      qaUnresolved,
      onQaStatusMapChange,
      onAutoMap,
      laneGrouping,
      onLaneGroupingChange,
      componentOptions,
      components,
      onComponentsChange,
      assigneeScope,
      onAssigneeScopeChange,
      refreshIntervalSec,
      onRefreshIntervalChange,
      effectiveJql,
      autoJql,
      customJql,
      onJqlChange,
    },
    ref,
  ) {
    const [rawJqlOpen, setRawJqlOpen] = useState(customJql);

    const toggleComponent = (c: string) => {
      const set = new Set(components);
      if (set.has(c)) set.delete(c);
      else if (set.size < MAX_COMPONENTS) set.add(c);
      onComponentsChange(Array.from(set));
    };

    return (
      <section
        ref={ref}
        className="rounded-md border border-subtle bg-surface-overlay/30"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-ink"
        >
          {open ? (
            <ChevronDown size={12} className="text-ink-muted" />
          ) : (
            <ChevronRight size={12} className="text-ink-muted" />
          )}
          <span className="font-medium">Advanced settings</span>
          {customJql && (
            <span className="ml-1 text-[10px] rounded-full px-1.5 py-0.5 bg-warn/10 text-warn border border-warn/30">
              custom
            </span>
          )}
        </button>
        {open && (
          <div className="px-3 pb-3 flex flex-col gap-4">
            <section>
              <h3 className="text-[12.5px] font-semibold text-ink mb-1.5">
                Statuses to track
              </h3>
              <StatusChipGroup
                statuses={projectStatuses}
                selected={selectedStatuses}
                loading={statusesLoading}
                error={statusesError}
                projectKey={projectKey || null}
                onToggle={onToggleStatus}
                onRetry={onRetryStatuses}
              />
            </section>

            <QaMappingTable
              statuses={selectedStatuses}
              value={qaStatusMap}
              unresolved={qaUnresolved}
              onChange={onQaStatusMapChange}
              onAutoMap={onAutoMap}
            />

            <Field label="Lane grouping">
              <div className="flex flex-wrap gap-1.5">
                {LANES.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => onLaneGroupingChange(l.id)}
                    aria-pressed={laneGrouping === l.id}
                    className={clsx(
                      "h-7 px-2.5 rounded-full text-[11.5px] border transition-colors",
                      laneGrouping === l.id
                        ? "bg-accent-dim text-accent-text border-accent/[0.3]"
                        : "bg-surface-elevated text-ink-muted border-subtle hover:text-ink hover:border-muted",
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </Field>

            {componentOptions.length > 0 && (
              <Field label="Components (optional)">
                <div className="flex flex-wrap gap-1.5">
                  {componentOptions.map((c) => {
                    const on = components.includes(c);
                    const disabled =
                      !on && components.length >= MAX_COMPONENTS;
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
                      onClick={() => onAssigneeScopeChange(opt.id)}
                      aria-pressed={assigneeScope === opt.id}
                      className={clsx(
                        "flex-1 h-7 rounded-md text-[11.5px] border transition-colors",
                        assigneeScope === opt.id
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
                  value={refreshIntervalSec}
                  onChange={(e) =>
                    onRefreshIntervalChange(Number(e.target.value))
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

            <section className="rounded-md border border-subtle">
              <button
                type="button"
                onClick={() => setRawJqlOpen((v) => !v)}
                aria-expanded={rawJqlOpen}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-ink"
              >
                <span className="flex items-center gap-1.5">
                  {rawJqlOpen ? (
                    <ChevronDown size={12} className="text-ink-muted" />
                  ) : (
                    <ChevronRight size={12} className="text-ink-muted" />
                  )}
                  <span className="font-medium">Raw JQL</span>
                </span>
                <span className="text-[10.5px] text-ink-faint">
                  {rawJqlOpen ? "Hide" : "Show"}
                </span>
              </button>
              {rawJqlOpen && (
                <div className="px-3 pb-3 flex flex-col gap-2">
                  {customJql && (
                    <div className="rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 flex items-start justify-between gap-2">
                      <p className="text-[11px] text-ink-secondary leading-snug">
                        Using custom JQL. The simple builder won't drive this
                        query until you reset it.
                      </p>
                      <button
                        type="button"
                        onClick={() => onJqlChange(autoJql, false)}
                        className="flex items-center gap-1 text-[11px] text-ink hover:text-accent-text whitespace-nowrap"
                        title="Reset to auto-generated JQL"
                      >
                        <RotateCcw size={11} />
                        Reset
                      </button>
                    </div>
                  )}
                  <textarea
                    value={effectiveJql}
                    onChange={(e) => onJqlChange(e.target.value, true)}
                    rows={4}
                    spellCheck={false}
                    className="g-input w-full text-[12px] font-mono resize-y"
                  />
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    );
  },
);

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
