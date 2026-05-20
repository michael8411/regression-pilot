import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { IconButton } from "@/components/ui";
import { Pencil, Trash2 } from "@/lib/icons";
import { cn } from "@/lib/cn";
import type { JiraTicket } from "@/types";
import { DraggableTicket } from "./DraggableTicket";

const NEEDS_REVIEW = "Needs Review";

export interface ThemeColumnProps {
  name: string;
  tickets: JiraTicket[];
  loading: boolean;
  onRename: (newName: string) => void;
  onRemove: () => void;
}

export function ThemeColumn({
  name,
  tickets,
  loading,
  onRename,
  onRemove,
}: ThemeColumnProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isNeedsReview = name === NEEDS_REVIEW;

  // Keep draft in sync if the parent renames us externally.
  useEffect(() => setDraft(name), [name]);

  // Autofocus + select on edit start.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const { setNodeRef, isOver } = useDroppable({
    id: `column::${name}`,
    data: { columnName: name, index: tickets.length },
  });

  const commitEdit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === name) {
      setDraft(name);
      return;
    }
    onRename(next);
  };

  const cancelEdit = () => {
    setDraft(name);
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-[300px] shrink-0 rounded-lg border bg-surface-elevated",
        "transition-colors duration-fast ease-smooth",
        isOver && !loading
          ? "border-accent shadow-glow-sm"
          : "border-subtle",
        isNeedsReview && "border-warn/30 bg-warn/5",
        loading && "pointer-events-none",
      )}
      data-testid={`theme-column-${name}`}
    >
      <header
        className={cn(
          "flex items-center gap-2 px-3 py-2 border-b",
          isNeedsReview ? "border-warn/20" : "border-subtle",
        )}
      >
        {editing && !isNeedsReview ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            onBlur={commitEdit}
            aria-label="Rename column"
            className={cn(
              "flex-1 min-w-0 bg-transparent outline-none",
              "border-b border-accent text-[13px] text-ink",
            )}
          />
        ) : (
          <button
            type="button"
            onClick={() => !isNeedsReview && setEditing(true)}
            disabled={isNeedsReview}
            className={cn(
              "flex-1 min-w-0 text-left text-[13px] font-medium truncate",
              isNeedsReview ? "text-warn cursor-default" : "text-ink hover:text-accent-text",
            )}
            title={
              isNeedsReview
                ? "AI couldn't categorize these"
                : "Click to rename"
            }
          >
            {name}
            {!isNeedsReview && (
              <Pencil
                size={11}
                className="inline-block ml-1.5 opacity-0 group-hover:opacity-60"
                aria-hidden
              />
            )}
          </button>
        )}
        <span className="text-[11px] text-ink-muted tabular-nums">
          {tickets.length}
        </span>
        {!isNeedsReview && (
          <IconButton
            size="sm"
            variant="danger"
            aria-label={`Remove column ${name}`}
            tooltip="Remove column"
            icon={<Trash2 />}
            onClick={onRemove}
          />
        )}
      </header>

      <SortableContext
        items={tickets.map((t) => t.key)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[80px]">
          {tickets.map((ticket, i) => (
            <DraggableTicket
              key={ticket.key}
              ticket={ticket}
              columnName={name}
              index={i}
            />
          ))}
          {tickets.length === 0 && !loading && (
            <p className="text-[11px] text-ink-muted text-center py-4">
              Drop tickets here
            </p>
          )}
          {loading && tickets.length === 0 && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-md bg-surface-overlay animate-pulse"
                />
              ))}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
