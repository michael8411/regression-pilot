import { useEffect, useState } from "react";
import { clsx } from "clsx";
import {
  listJiraProjectsForLive,
  listJiraVersionsForLive,
} from "@/components/live/lib/api";
import type { JiraProject, JiraVersion } from "@/types";

interface Props {
  name: string;
  projectKey: string;
  versionName: string;
  pinned: boolean;
  suggestedName: string;
  selectedCount: number;
  totalStatuses: number;
  statusesLoading: boolean;
  statusesError: string | null;
  onNameChange: (next: string) => void;
  onProjectChange: (next: string) => void;
  onVersionChange: (next: string) => void;
  onPinnedChange: (next: boolean) => void;
  onCustomize: () => void;
  onRetryStatuses: () => void;
}

export function QuickStep(props: Props) {
  const {
    name,
    projectKey,
    versionName,
    pinned,
    suggestedName,
    selectedCount,
    totalStatuses,
    statusesLoading,
    statusesError,
    onNameChange,
    onProjectChange,
    onVersionChange,
    onPinnedChange,
    onCustomize,
    onRetryStatuses,
  } = props;

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
    if (!projectKey) {
      setVersions([]);
      return;
    }
    void (async () => {
      try {
        const list = await listJiraVersionsForLive(projectKey);
        if (!cancelled) setVersions(list);
      } catch {
        if (!cancelled) setVersions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectKey]);

  const nameDiffers = name.trim() !== suggestedName.trim() && !!suggestedName;

  return (
    <div className="flex flex-col gap-4">
      <Field label="Board name">
        <input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="g-input w-full text-[12.5px]"
          placeholder="FM • 25.7"
          spellCheck={false}
        />
        {nameDiffers && (
          <button
            type="button"
            onClick={() => onNameChange(suggestedName)}
            className="mt-1 text-[10.5px] text-accent-text hover:underline"
          >
            Use suggested name ({suggestedName})
          </button>
        )}
      </Field>

      <Field label="Project">
        <select
          value={projectKey}
          onChange={(e) => onProjectChange(e.target.value)}
          className="g-input w-full text-[12.5px]"
        >
          {projects.length === 0 && (
            <option value={projectKey}>{projectKey || "Loading…"}</option>
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
          value={versionName}
          onChange={(e) => onVersionChange(e.target.value)}
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

      <Field label="Statuses">
        {!projectKey ? (
          <p className="text-[11px] text-ink-faint">
            Pick a project to see its workflow.
          </p>
        ) : statusesError ? (
          <div className="flex items-center justify-between rounded-md border border-err/30 bg-err/10 px-2.5 py-1.5">
            <span className="text-[11px] text-err truncate">
              {statusesError}
            </span>
            <button
              type="button"
              onClick={onRetryStatuses}
              className="g-btn text-[11px] px-2 py-1 ml-2"
            >
              Retry
            </button>
          </div>
        ) : statusesLoading && totalStatuses === 0 ? (
          <p className="text-[11px] text-ink-faint">Loading workflow…</p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-ink-secondary">
              Tracking {selectedCount} of {totalStatuses} QA statuses for{" "}
              {projectKey} workflow.
            </p>
            <button
              type="button"
              onClick={onCustomize}
              className="g-btn text-[11px] px-2 py-1"
            >
              Customize
            </button>
          </div>
        )}
      </Field>

      <label className="flex items-center gap-2 text-[12px] text-ink select-none">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => onPinnedChange(e.target.checked)}
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
      <label
        className={clsx(
          "text-[11.5px] text-ink-muted mb-1 block",
        )}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
