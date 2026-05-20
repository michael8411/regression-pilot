import { useState } from "react";
import {
  Edit3,
  Folder,
  Info,
  Plus,
  Trash2,
} from "@/lib/icons";
import { Button, IconButton, Spinner } from "@/components/ui";
import { SettingsPaneHeader } from "../SettingsPaneHeader";
import { RepoMappingDialog } from "../RepoMappingDialog";
import { useRepoMappings } from "../hooks/useRepoMappings";
import type { RepoMapping } from "@/types/repoMapping";

export function RepoMappingPane() {
  const { mappings, loading, error, create, update, remove } = useRepoMappings();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RepoMapping | null>(null);

  return (
    <div className="flex flex-col h-full">
      <SettingsPaneHeader
        title="Repo Mapping"
        subtitle="Fallback configuration for projects where Jira does not expose a full PR URL. Testdeck uses PRs linked in Jira Development first; mappings are only needed when those links are missing."
      />
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <div className="flex items-center justify-end mb-3">
          <Button
            variant="primary"
            size="sm"
            leading={<Plus size={12} />}
            onClick={() => setAdding(true)}
          >
            Add mapping
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-err/30 bg-err/10 px-3 py-2 text-[11.5px] text-err mb-3"
          >
            {error}
          </div>
        )}

        <div className="rounded-xl border border-subtle bg-surface-panel overflow-hidden">
          <div
            className="grid gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider text-ink-muted border-b border-subtle font-mono"
            style={{ gridTemplateColumns: "180px 160px 1fr 88px" }}
          >
            <span>Jira project</span>
            <span>Platform</span>
            <span>Repository</span>
            <span />
          </div>

          {loading && (
            <div className="flex justify-center items-center py-10 text-ink-muted">
              <Spinner size={14} />
            </div>
          )}

          {!loading &&
            mappings.map((m) => (
              <div
                key={m.id}
                className="grid gap-3 px-4 py-3 items-center border-b border-subtle last:border-b-0"
                style={{ gridTemplateColumns: "180px 160px 1fr 88px" }}
              >
                <span className="text-[12.5px] text-ink font-mono">
                  {m.jira_project}
                </span>
                <span className="text-[12px] text-ink-secondary flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background:
                        m.platform === "github" ? "#8B5CF6" : "#0078D4",
                    }}
                  />
                  {m.platform === "github" ? "GitHub" : "Azure DevOps"}
                </span>
                <span className="text-[12px] text-ink font-mono truncate">
                  {m.org ? `${m.org}/${m.repo}` : m.repo}
                </span>
                <span className="flex items-center justify-end gap-1">
                  <IconButton
                    size="sm"
                    aria-label="Edit"
                    icon={<Edit3 size={12} />}
                    onClick={() => setEditing(m)}
                  />
                  <IconButton
                    size="sm"
                    aria-label="Remove"
                    icon={<Trash2 size={12} />}
                    onClick={() => void remove(m.id)}
                  />
                </span>
              </div>
            ))}

          {!loading && mappings.length === 0 && (
            <div className="py-10 text-center">
              <Folder size={20} className="mx-auto text-ink-faint" />
              <div className="mt-2 text-[13px] text-ink-secondary">
                No repositories mapped
              </div>
              <div className="mt-1 text-[11.5px] text-ink-muted">
                Add a mapping to connect a Jira project to its code repo.
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-md border border-info/20 bg-info/5 px-3 py-2.5 flex gap-2 items-start">
          <Info size={13} className="text-info mt-0.5 shrink-0" />
          <div className="text-[11.5px] text-ink-secondary leading-snug">
            Testdeck now uses PRs linked in Jira Development first. Add
            mappings only as a fallback for projects where Jira does not expose
            a full PR URL (e.g. older manual tickets or incomplete dev links).
          </div>
        </div>
      </div>

      {adding && (
        <RepoMappingDialog
          mode="create"
          onClose={() => setAdding(false)}
          onSubmit={async (payload) => {
            await create(payload);
          }}
        />
      )}
      {editing && (
        <RepoMappingDialog
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (payload) => {
            await update(editing.id, payload);
          }}
        />
      )}
    </div>
  );
}
