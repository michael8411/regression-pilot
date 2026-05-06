import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  Archive,
  ArchiveRestore,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  type IconComponent,
} from "@/lib/icons";
import type { Conversation } from "@/types/conversations";

interface Props {
  conversation: Conversation;
  selected: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationRow({
  conversation,
  selected,
  onSelect,
  onTogglePin,
  onToggleArchive,
  onRename,
  onDelete,
}: Props) {
  const { id, title, updated_at, pinned, archived } = conversation;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);
  useEffect(() => {
    setDraft(title);
  }, [title]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== title) onRename(id, next);
    else setDraft(title);
  };

  return (
    <li
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={() => !editing && onSelect(id)}
      onKeyDown={(e) => {
        if (!editing && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(id);
        }
      }}
      className={clsx(
        "group relative flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer",
        "border border-transparent transition-colors",
        selected
          ? "bg-accent-dim border-accent/[0.18]"
          : "hover:bg-surface-overlay/60",
        archived && "opacity-60",
      )}
    >
      {pinned && <Pin size={11} className="text-accent-text shrink-0" />}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDraft(title);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="g-input text-[12.5px] w-full px-2 py-1"
          />
        ) : (
          <div className="text-[12.5px] text-ink truncate font-medium">
            {title}
          </div>
        )}
        <div className="text-[10.5px] text-ink-faint">
          {relativeTime(updated_at)}
        </div>
      </div>

      <div
        className={clsx(
          "flex items-center gap-0.5 transition-opacity",
          editing
            ? "opacity-0 pointer-events-none"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <RowAction
          icon={pinned ? PinOff : Pin}
          label={pinned ? "Unpin" : "Pin"}
          onClick={() => onTogglePin(id)}
        />
        <RowAction
          icon={Pencil}
          label="Rename"
          onClick={() => setEditing(true)}
        />
        <RowAction
          icon={archived ? ArchiveRestore : Archive}
          label={archived ? "Unarchive" : "Archive"}
          onClick={() => onToggleArchive(id)}
        />
        <RowAction
          icon={Trash2}
          label="Delete"
          tone="danger"
          onClick={() => {
            if (confirm(`Delete "${title}"? This cannot be undone.`)) {
              onDelete(id);
            }
          }}
        />
      </div>
    </li>
  );
}

function RowAction({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: IconComponent;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        "w-6 h-6 rounded-md flex items-center justify-center",
        "hover:bg-surface-overlay text-ink-muted hover:text-ink",
        tone === "danger" && "hover:text-err",
      )}
    >
      <Icon size={12} />
    </button>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
