import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Folder, X } from "@/lib/icons";
import { Button, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getProjects } from "@/lib/api";
import type { JiraProject } from "@/types";
import type {
  RepoMapping,
  RepoMappingCreate,
  RepoMappingUpdate,
  RepoPlatform,
} from "@/types/repoMapping";
import { listAdoRepos, listGithubRepos } from "./lib/coreConnectionsApi";

interface BaseProps {
  onClose: () => void;
}

interface CreateProps extends BaseProps {
  mode: "create";
  existing?: undefined;
  onSubmit: (payload: RepoMappingCreate) => Promise<void> | void;
}

interface EditProps extends BaseProps {
  mode: "edit";
  existing: RepoMapping;
  onSubmit: (payload: RepoMappingUpdate) => Promise<void> | void;
}

type Props = CreateProps | EditProps;

const STATIC_SUGGESTIONS: Record<RepoPlatform, string[]> = {
  github: [
    "hcss-dev/fleet-mobile-ios",
    "hcss-dev/fleet-mobile-android",
    "hcss-dev/crew-scheduler",
  ],
  azure_devops: [
    "hcss/heavyjob-desktop",
    "hcss/equipment360",
    "hcss/telematics-core",
  ],
};

export function RepoMappingDialog(props: Props) {
  const { onClose } = props;
  const existing = props.mode === "edit" ? props.existing : undefined;

  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [project, setProject] = useState<string>(existing?.jira_project ?? "");
  const [platform, setPlatform] = useState<RepoPlatform>(
    existing?.platform ?? "github",
  );
  const [repo, setRepo] = useState(
    existing
      ? existing.org && existing.repo
        ? `${existing.org}/${existing.repo}`
        : existing.repo
      : "",
  );
  const [suggestions, setSuggestions] = useState<string[]>(
    STATIC_SUGGESTIONS[existing?.platform ?? "github"],
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await getProjects();
        if (!cancelled) {
          setProjects(list);
          if (!existing && !project && list.length > 0) {
            setProject(list[0].key);
          }
        }
      } catch {
        /* projects optional — user can type one in the form */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const fn = platform === "github" ? listGithubRepos : listAdoRepos;
        const { repos } = await fn();
        if (!cancelled && repos.length > 0) {
          setSuggestions(repos.slice(0, 6));
          return;
        }
      } catch {
        /* fall back to static */
      }
      if (!cancelled) setSuggestions(STATIC_SUGGESTIONS[platform]);
    })();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const parsedRepo = parseOrgRepo(repo);

  const submit = async () => {
    if (!repo.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      if (props.mode === "create") {
        if (!project.trim()) {
          setErr("Pick a Jira project");
          return;
        }
        await props.onSubmit({
          jira_project: project.trim(),
          platform,
          org: parsedRepo.org,
          repo: parsedRepo.repo,
        });
      } else {
        await props.onSubmit({
          platform,
          org: parsedRepo.org,
          repo: parsedRepo.repo,
        });
      }
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={existing ? "Edit repo mapping" : "Add repo mapping"}
      onClick={onClose}
      className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(520px, 92vw)" }}
        className="flex flex-col overflow-hidden rounded-2xl border border-muted bg-surface-elevated shadow-float"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-subtle">
          <div className="flex items-center gap-2">
            <Folder size={14} className="text-accent-text" />
            <h2 className="text-[14px] font-semibold text-ink">
              {existing ? "Edit repo mapping" : "Add repo mapping"}
            </h2>
          </div>
          <IconButton size="sm" icon={<X size={14} />} aria-label="Close" onClick={onClose} />
        </header>

        <div className="px-5 py-4">
          <div className="mb-3">
            <label className="text-[11px] text-ink-muted mb-1 block">
              Jira project
            </label>
            {existing ? (
              <input
                disabled
                value={existing.jira_project}
                className="g-input text-[12.5px] font-mono opacity-70"
              />
            ) : (
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="g-input text-[12.5px]"
              >
                {projects.length === 0 && (
                  <option value="">— no projects loaded —</option>
                )}
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} — {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mb-3">
            <label className="text-[11px] text-ink-muted mb-1 block">
              Platform
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["github", "GitHub", "#8B5CF6"],
                  ["azure_devops", "Azure DevOps", "#0078D4"],
                ] as const
              ).map(([id, label, color]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlatform(id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md border text-left transition-colors",
                    platform === id
                      ? "bg-accent/10 border-accent"
                      : "bg-surface-overlay border-subtle hover:border-muted",
                  )}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="text-[12.5px] text-ink">{label}</span>
                  {platform === id && (
                    <Check size={13} className="ml-auto text-accent" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-1">
            <label className="text-[11px] text-ink-muted mb-1 block">
              Repository
            </label>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder={
                platform === "github" ? "org/repo-name" : "project/repo-name"
              }
              spellCheck={false}
              autoComplete="off"
              className="g-input text-[12.5px] font-mono"
            />
          </div>

          {suggestions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">
                Suggestions
              </span>
              {suggestions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRepo(r)}
                  className="h-6 px-2 rounded-full border border-subtle bg-surface-overlay text-[11px] text-ink-secondary hover:bg-surface-elevated hover:text-ink"
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {err && (
            <div className="mt-3 text-[11.5px] text-err">{err}</div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-subtle">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={saving || !repo.trim()}
            loading={saving}
          >
            Save
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function parseOrgRepo(value: string): { org: string; repo: string } {
  const trimmed = value.trim();
  if (!trimmed) return { org: "", repo: "" };
  const idx = trimmed.indexOf("/");
  if (idx < 0) return { org: "", repo: trimmed };
  return {
    org: trimmed.slice(0, idx),
    repo: trimmed.slice(idx + 1),
  };
}
