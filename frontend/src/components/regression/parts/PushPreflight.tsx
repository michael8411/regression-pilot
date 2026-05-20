import { Checkbox } from "@/components/ui";
import { AlertTriangle } from "@/lib/icons";
import { FolderPicker } from "./FolderPicker";

export interface PushPreflightProps {
  count: number;
  projectKey: string;
  folderId: number | null;
  onFolderChange: (id: number | null) => void;
  tagWithPrefix: boolean;
  onTagChange: (next: boolean) => void;
}

/**
 * Preflight content for the Push dialog: count summary, optional
 * folder picker, name-prefix toggle, and a duplication warning.
 */
export function PushPreflight({
  count,
  projectKey,
  folderId,
  onFolderChange,
  tagWithPrefix,
  onTagChange,
}: PushPreflightProps) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="t-title text-ink">
          {count} test case{count === 1 ? "" : "s"} → {projectKey || "(no project)"}
        </p>
        <p className="t-meta text-ink-muted mt-1">
          Cases will appear in Zephyr Scale as new tests.
        </p>
      </div>

      <Section label="Folder (optional)">
        <FolderPicker
          projectKey={projectKey}
          value={folderId}
          onChange={onFolderChange}
        />
      </Section>

      <Section label="Naming">
        <Checkbox
          checked={tagWithPrefix}
          onChange={onTagChange}
          size="sm"
          label={
            <span className="t-body text-ink-secondary">
              Prefix names with{" "}
              <span className="font-mono text-ink">
                [{projectKey || "KEY"}]
              </span>
            </span>
          }
        />
      </Section>

      <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] text-warn">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden />
        <p>
          Pushes to a real Zephyr project. Re-running creates duplicates — edit
          names on the Review screen first if you’re re-pushing.
        </p>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="t-label block mb-1.5">{label}</span>
      {children}
    </div>
  );
}
