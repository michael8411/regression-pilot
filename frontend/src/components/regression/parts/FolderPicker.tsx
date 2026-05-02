import { useEffect } from "react";
import { ChevronDown, Loader2 } from "@/lib/icons";
import { useAsync } from "@/hooks/useAsync";
import { getZephyrFolders } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ZephyrFolder } from "@/types";

export interface FolderPickerProps {
  projectKey: string;
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
}

/**
 * Native <select> wrapper around the Zephyr folder list. Folders nest
 * arbitrarily — depth is computed by walking parentId chains. The
 * select is disabled while loading and surfaces a small error
 * message below it on failure.
 */
export function FolderPicker({
  projectKey,
  value,
  onChange,
  disabled,
}: FolderPickerProps) {
  const folders = useAsync<ZephyrFolder[]>();

  useEffect(() => {
    if (!projectKey) {
      folders.reset();
      return;
    }
    folders.execute(() => getZephyrFolders(projectKey)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  if (!projectKey) {
    return <p className="t-meta text-ink-muted">Pick a project first.</p>;
  }

  const isDisabled = disabled || folders.loading || !!folders.error;

  return (
    <div>
      <div className="relative">
        <select
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value ? Number(e.target.value) : null)
          }
          disabled={isDisabled}
          aria-label="Zephyr folder"
          className={cn(
            "appearance-none w-full h-9 pl-3 pr-8 rounded-md",
            "bg-surface-input text-[13px] text-ink",
            "border border-subtle outline-none",
            "focus:border-accent focus:ring-2 focus:ring-accent/30",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          <option value="">Project root</option>
          {(folders.data ?? []).map((f) => (
            <option key={f.id} value={f.id} className="text-ink">
              {indentFolder(f, folders.data ?? [])}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted">
          {folders.loading ? (
            <Loader2 size={14} className="animate-spin-fast" />
          ) : (
            <ChevronDown size={14} />
          )}
        </span>
      </div>
      {folders.error && (
        <p className="text-[11px] text-err mt-1">
          Couldn’t load folders: {folders.error}
        </p>
      )}
    </div>
  );
}

function indentFolder(f: ZephyrFolder, all: ZephyrFolder[]): string {
  let depth = 0;
  let cur: ZephyrFolder | undefined = f;
  // Walk up parents to compute depth. O(n²) for n folders; fine for
  // typical Zephyr projects (<100 folders). Phase 11 may switch to a
  // pre-built Map<id, folder> if real users complain.
  while (cur?.parentId != null) {
    const parent = all.find((p) => p.id === cur!.parentId);
    if (!parent) break;
    depth++;
    cur = parent;
  }
  return `${"  ".repeat(depth)}${f.name}`;
}
