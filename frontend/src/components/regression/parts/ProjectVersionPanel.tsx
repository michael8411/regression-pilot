import { useEffect, useMemo } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getProjects, getVersions } from "@/lib/api";
import { Button, SectionLabel } from "@/components/ui";
import { ChevronDown, Loader2 } from "@/lib/icons";
import { cn } from "@/lib/cn";
import type { JiraProject, JiraVersion } from "@/types";

export interface ProjectVersionPanelProps {
  selectedProject: JiraProject | undefined;
  selectedVersion: JiraVersion | undefined;
  onProjectChange: (p: JiraProject) => void;
  onVersionChange: (v: JiraVersion) => void;
  selectedCount: number;
  totalCount: number;
  onClearAll: () => void;
}

/**
 * Left pane of the workbench: project picker, version picker, and a
 * small "selected" summary card. Owns its own data fetching so the
 * parent stays focused on tickets and selection state.
 */
export function ProjectVersionPanel({
  selectedProject,
  selectedVersion,
  onProjectChange,
  onVersionChange,
  selectedCount,
  totalCount,
  onClearAll,
}: ProjectVersionPanelProps) {
  const projects = useAsync<JiraProject[]>();
  const versions = useAsync<JiraVersion[]>();

  // Load projects once on mount.
  useEffect(() => {
    projects.execute(() => getProjects()).catch(() => {
      // useAsync surfaces the error via projects.error — nothing else to do.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload versions whenever the selected project changes.
  const projectKey = selectedProject?.key;
  useEffect(() => {
    if (!projectKey) {
      versions.reset();
      return;
    }
    versions.execute(() => getVersions(projectKey)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  const projectOptions = useMemo<Option<JiraProject>[]>(
    () =>
      (projects.data ?? []).map((p) => ({
        value: p.key,
        label: `${p.key} · ${p.name}`,
        raw: p,
      })),
    [projects.data],
  );

  const versionOptions = useMemo<Option<JiraVersion>[]>(
    () =>
      (versions.data ?? []).map((v) => ({
        value: v.id,
        label: v.name,
        raw: v,
      })),
    [versions.data],
  );

  const versionPlaceholder = !selectedProject
    ? "Pick a project first"
    : versions.loading
    ? "Loading versions…"
    : versions.data && versions.data.length === 0
    ? "No versions for this project"
    : "Select version";

  return (
    <aside
      className={cn(
        "w-[280px] shrink-0 sticky top-0 self-start",
        "flex flex-col gap-5 px-4 py-5 border-r border-subtle",
        "bg-surface-panel/50",
      )}
      aria-label="Project and version picker"
    >
      <div>
        <SectionLabel className="px-0 pt-0">Project</SectionLabel>
        <NativeSelect
          value={selectedProject?.key ?? ""}
          loading={projects.loading}
          options={projectOptions}
          onChange={(opt) => onProjectChange(opt.raw)}
          placeholder={projects.loading ? "Loading…" : "Select project"}
          aria-label="Project"
        />
        {projects.error && (
          <p className="text-[11px] text-err mt-1">{projects.error}</p>
        )}
      </div>

      <div>
        <SectionLabel className="px-0 pt-0">Version</SectionLabel>
        <NativeSelect
          value={selectedVersion?.id ?? ""}
          loading={versions.loading}
          disabled={
            !selectedProject ||
            versions.loading ||
            (versions.data?.length ?? 0) === 0
          }
          options={versionOptions}
          onChange={(opt) => onVersionChange(opt.raw)}
          placeholder={versionPlaceholder}
          aria-label="Version"
        />
        {versions.error && (
          <p className="text-[11px] text-err mt-1">{versions.error}</p>
        )}
      </div>

      <SelectedSummary
        selected={selectedCount}
        total={totalCount}
        onClearAll={onClearAll}
      />
    </aside>
  );
}

interface Option<T> {
  value: string;
  label: string;
  raw: T;
}

interface NativeSelectProps<T> {
  value: string;
  loading?: boolean;
  disabled?: boolean;
  options: Option<T>[];
  onChange: (option: Option<T>) => void;
  placeholder: string;
  "aria-label"?: string;
}

/**
 * Styled wrapper around <select>. Phase 11 will replace this with a
 * proper Combobox; until then the native dropdown gives us keyboard
 * support and platform a11y for free.
 */
function NativeSelect<T>({
  value,
  loading,
  disabled,
  options,
  onChange,
  placeholder,
  ...rest
}: NativeSelectProps<T>) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled || loading}
        onChange={(e) => {
          const opt = options.find((o) => o.value === e.target.value);
          if (opt) onChange(opt);
        }}
        className={cn(
          "appearance-none w-full h-9 pl-3 pr-8 rounded-lg",
          "bg-surface-input text-[13px] text-ink",
          "border border-muted hover:border-strong",
          "focus:outline-none focus:ring-2 focus:ring-accent/40",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          !value && "text-ink-muted",
        )}
        {...rest}
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="text-ink">
            {opt.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted">
        {loading ? (
          <Loader2 size={14} className="animate-spin-fast" />
        ) : (
          <ChevronDown size={14} />
        )}
      </span>
    </div>
  );
}

interface SelectedSummaryProps {
  selected: number;
  total: number;
  onClearAll: () => void;
}

function SelectedSummary({
  selected,
  total,
  onClearAll,
}: SelectedSummaryProps) {
  if (total === 0 && selected === 0) return null;
  return (
    <div
      className={cn(
        "rounded-lg border border-subtle bg-surface-elevated",
        "px-3 py-3 flex flex-col gap-2",
      )}
    >
      <SectionLabel className="px-0 pt-0 pb-0">Selected</SectionLabel>
      <div className="flex items-baseline gap-1">
        <span className="t-h2 text-ink tnum">{selected}</span>
        <span className="t-meta text-ink-muted">/ {total}</span>
      </div>
      {selected > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          aria-label="Clear all selected tickets"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
