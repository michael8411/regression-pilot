import { useState } from "react";
import { clsx } from "clsx";
import {
  Pencil,
  Pin,
  PinOff,
  Trash2,
  type IconComponent,
} from "@/lib/icons";
import type { LiveBoard } from "@/types/live";

interface Props {
  board: LiveBoard;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onEdit: (b: LiveBoard) => void;
  onDelete: (id: string) => void;
}

export function BoardCard({
  board,
  onOpen,
  onTogglePin,
  onEdit,
  onDelete,
}: Props) {
  const [hover, setHover] = useState(false);
  const { id, name, jql, pinned, updated_at } = board;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(id);
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={clsx(
        "group relative flex flex-col gap-2 rounded-xl px-3.5 py-3 cursor-pointer",
        "border border-subtle bg-surface-elevated hover:border-accent/[0.25] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {pinned && <Pin size={11} className="text-accent-text" />}
            <h3 className="text-[13px] font-semibold text-ink truncate">
              {name}
            </h3>
          </div>
          <code className="block mt-1 text-[10.5px] text-ink-faint truncate font-mono">
            {jql}
          </code>
        </div>
        <div
          className={clsx(
            "flex items-center gap-0.5 transition-opacity",
            hover ? "opacity-100" : "opacity-0",
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
            label="Edit"
            onClick={() => onEdit(board)}
          />
          <RowAction
            icon={Trash2}
            label="Delete"
            tone="danger"
            onClick={() => {
              if (confirm(`Delete "${name}"? This cannot be undone.`)) {
                onDelete(id);
              }
            }}
          />
        </div>
      </div>
      <div className="text-[10.5px] text-ink-faint">
        Updated {relativeTime(updated_at)}
      </div>
    </div>
  );
}

function RowAction({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        "w-7 h-7 rounded-md flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-overlay",
        tone === "danger" && "hover:text-err",
      )}
    >
      <Icon size={12} />
    </button>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
