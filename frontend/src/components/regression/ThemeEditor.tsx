import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  ArrowRight,
  CircleAlert,
  Layers,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "@/lib/icons";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import { Button, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useRegressionSession } from "./hooks/useRegressionSession";
import { useThemes, type ThemeMap } from "./hooks/useThemes";
import { ThemeColumn } from "./parts/ThemeColumn";
import { EmptyState } from "./parts/EmptyState";

export function ThemeEditor() {
  const { goto } = useRoute();
  const { state, isRestoring, saveStateBatch } = useRegressionSession();

  const onContinueGoto = useCallback(
    () => goto(["regression", "generate"]),
    [goto],
  );

  if (isRestoring) return <ThemeEditorSkeleton />;

  if (state.selectedTickets.length === 0) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        <EmptyState
          icon={Layers}
          title="Pick tickets first"
          description="Select Jira tickets in the Workbench to organize them into themes."
          action={{
            label: "Go to Workbench",
            onClick: () => goto(["regression", "workbench"]),
          }}
        />
      </div>
    );
  }

  return (
    <ThemeEditorInner
      tickets={state.selectedTickets}
      versionName={state.selectedVersion?.name ?? ""}
      saveStateBatch={saveStateBatch}
      onContinueGoto={onContinueGoto}
    />
  );
}

interface InnerProps {
  tickets: import("@/types").JiraTicket[];
  versionName: string;
  saveStateBatch: (items: Record<string, unknown>) => Promise<void>;
  onContinueGoto: () => void;
}

function ThemeEditorInner({
  tickets,
  versionName,
  saveStateBatch,
  onContinueGoto,
}: InnerProps) {
  const themes = useThemes(tickets);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collision: CollisionDetection = useCallback((args) => {
    const ptr = pointerWithin(args);
    return ptr.length > 0 ? ptr : closestCenter(args);
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      if (themes.loading) return;
      if (!e.over) return;
      const ticketKey = String(e.active.id);
      const overData = e.over.data.current as
        | { columnName?: string; index?: number }
        | undefined;
      const fromData = e.active.data.current as
        | { columnName?: string; index?: number }
        | undefined;

      // dnd-kit hands us either a ticket id ("FM-1234") or a column-empty
      // droppable id ("column::Login"). Both expose `columnName` via
      // `data.current` — the ticket via DraggableTicket, the column via
      // ThemeColumn's useDroppable.
      const toColumn = overData?.columnName;
      if (!toColumn) return;

      let toIndex = overData?.index ?? Infinity;

      // No-op when dropping on yourself.
      if (e.over.id === e.active.id) return;

      // When reordering inside the same column, fix off-by-one when the
      // moving ticket sits above the drop target.
      if (
        fromData?.columnName === toColumn &&
        typeof fromData.index === "number" &&
        typeof overData?.index === "number" &&
        fromData.index < overData.index
      ) {
        toIndex = Math.max(0, overData.index - 1);
      }

      themes.moveTicket(ticketKey, toColumn, toIndex);
    },
    [themes],
  );

  const onContinue = useCallback(async () => {
    if (Object.keys(themes.themes).length === 0) return;
    await saveStateBatch({
      editableGroups: themes.themes,
      currentRoute: ["regression", "generate"],
    });
    onContinueGoto();
  }, [themes.themes, saveStateBatch, onContinueGoto]);

  // ── Command palette ────────────────────────────────────────────
  const regroupCmd = useMemo<CommandItem | false>(
    () =>
      tickets.length === 0
        ? false
        : {
            id: "themes.regroup",
            group: "ai",
            ai: true,
            label: "Regroup themes (AI)",
            sub: "themes",
            icon: Sparkles,
            action: { type: "run", run: themes.regroup },
          },
    [tickets.length, themes.regroup],
  );
  useRegisterCommand(regroupCmd);

  const continueCmd = useMemo<CommandItem | false>(
    () =>
      Object.keys(themes.themes).length === 0 || themes.loading
        ? false
        : {
            id: "themes.continue",
            group: "action",
            label: "Continue to generate",
            sub: "themes",
            icon: ArrowRight,
            kbd: "Mod+Enter",
            action: { type: "run", run: onContinue },
          },
    [themes.themes, themes.loading, onContinue],
  );
  useRegisterCommand(continueCmd);

  const columnCount = Object.keys(themes.themes).length;
  const canContinue = columnCount > 0 && !themes.loading;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <Header
        ticketCount={tickets.length}
        version={versionName}
        regrouping={themes.loading}
        onRegroup={themes.regroup}
        canContinue={canContinue}
        onContinue={onContinue}
        cached={themes.isCachedFromSession}
      />

      {themes.error && (
        <ErrorBanner message={themes.error} onRetry={themes.regroup} />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragEnd={onDragEnd}
      >
        <div className="flex-1 min-h-0 overflow-x-auto">
          <div className="flex gap-4 px-6 py-5 h-full">
            {columnCount === 0 && themes.loading ? (
              <PlaceholderColumns />
            ) : columnCount === 0 ? (
              <FreshGroupingPrompt onRegroup={themes.regroup} />
            ) : (
              Object.entries(themes.themes).map(([name, items]) => (
                <ThemeColumn
                  key={name}
                  name={name}
                  tickets={items}
                  loading={themes.loading}
                  onRename={(newName) => themes.renameColumn(name, newName)}
                  onRemove={() => themes.removeColumn(name)}
                />
              ))
            )}
            {columnCount > 0 && (
              <NewColumnAffordance
                disabled={themes.loading}
                onAdd={themes.addColumn}
              />
            )}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

interface HeaderProps {
  ticketCount: number;
  version: string;
  regrouping: boolean;
  onRegroup: () => Promise<void>;
  canContinue: boolean;
  onContinue: () => Promise<void>;
  cached: boolean;
}

function Header({
  ticketCount,
  version,
  regrouping,
  onRegroup,
  canContinue,
  onContinue,
  cached,
}: HeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-subtle">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="t-h2 text-ink">Themes</h1>
          {cached && !regrouping && (
            <span
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-overlay text-ink-muted"
              title="Loaded from your saved session — no AI call was made"
            >
              cached
            </span>
          )}
        </div>
        <p className="t-meta text-ink-muted">
          {version ? `${version} · ` : ""}
          {ticketCount} tickets
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="md"
          loading={regrouping}
          onClick={() => void onRegroup()}
          leading={<Sparkles size={14} />}
        >
          Regroup
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={!canContinue}
          onClick={() => void onContinue()}
          trailing={<ArrowRight size={14} />}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

function NewColumnAffordance({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const value = draft.trim();
    setEditing(false);
    setDraft("");
    if (value) onAdd(value);
  };

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        className={cn(
          "flex flex-col items-center justify-center w-[300px] shrink-0",
          "rounded-lg border border-dashed border-muted",
          "text-ink-muted hover:text-ink hover:border-strong hover:bg-surface-overlay",
          "transition-colors duration-fast ease-smooth",
          "min-h-[180px]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        <Plus size={18} />
        <span className="t-meta mt-1">New theme</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col w-[300px] shrink-0 rounded-lg border border-accent/40 bg-surface-elevated">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle">
        <input
          autoFocus
          value={draft}
          placeholder="Theme name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              setDraft("");
            }
          }}
          onBlur={commit}
          className="flex-1 min-w-0 bg-transparent outline-none border-b border-accent text-[13px] text-ink"
        />
        <IconButton
          size="sm"
          aria-label="Cancel"
          icon={<X />}
          onClick={() => {
            setEditing(false);
            setDraft("");
          }}
        />
      </div>
      <div className="flex-1 p-2">
        <p className="text-[11px] text-ink-muted text-center py-4">
          Press Enter to add
        </p>
      </div>
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-6 py-2 border-b border-err/30 bg-err/5 text-[12px] text-err"
    >
      <CircleAlert size={14} className="shrink-0" />
      <span className="flex-1 min-w-0 truncate">{message}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void onRetry()}
        leading={<RefreshCw size={12} />}
      >
        Retry
      </Button>
    </div>
  );
}

function PlaceholderColumns() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, c) => (
        <div
          key={c}
          className="flex flex-col w-[300px] shrink-0 rounded-lg border border-subtle bg-surface-elevated"
          aria-hidden
        >
          <div className="px-3 py-2 border-b border-subtle">
            <div className="h-4 w-32 rounded bg-surface-overlay animate-pulse" />
          </div>
          <div className="p-2 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-md bg-surface-overlay animate-pulse"
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function FreshGroupingPrompt({
  onRegroup,
}: {
  onRegroup: () => Promise<void>;
}) {
  return (
    <div className="flex-1 flex items-center justify-center w-full">
      <EmptyState
        icon={Sparkles}
        title="No themes yet"
        description="Let the AI organize your tickets, or use “New theme” on the right to start a column manually."
        tone="accent"
        action={{
          label: "Group with AI",
          onClick: () => {
            void onRegroup();
          },
        }}
      />
    </div>
  );
}

function ThemeEditorSkeleton() {
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-subtle">
        <div className="space-y-2">
          <div className="h-5 w-28 rounded bg-surface-overlay animate-pulse" />
          <div className="h-3 w-56 rounded bg-surface-overlay animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-lg bg-surface-overlay animate-pulse" />
          <div className="h-9 w-28 rounded-lg bg-surface-overlay animate-pulse" />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="flex gap-4 px-6 py-5 h-full">
          {Array.from({ length: 3 }).map((_, c) => (
            <div
              key={c}
              className="flex flex-col w-[300px] shrink-0 rounded-lg border border-subtle bg-surface-elevated"
            >
              <div className="px-3 py-2 border-b border-subtle">
                <div className="h-4 w-32 rounded bg-surface-overlay animate-pulse" />
              </div>
              <div className="p-2 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-md bg-surface-overlay animate-pulse"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Avoid an "unused export" warning when ThemeMap is only consumed
// transitively via the hook re-export.
export type { ThemeMap };
