import { useCallback, useMemo, useState } from "react";
import { Plus } from "@/lib/icons";
import { useLiveBoards } from "@/components/live/hooks/useLiveBoards";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import { BoardListSkeleton } from "./BoardListSkeleton";
import {
  LiveActivityRail,
  LiveBoardFilters,
  LiveBoardsGrid,
  LiveHomeHeader,
  LiveStatsStrip,
  type LiveActivityRailEntry,
  type LiveBoardFilterChip,
} from "./home";
import {
  BoardBuilderDialog,
  type BoardBuilderSubmitPayload,
} from "./board-builder";
import type { LiveBoard } from "@/types/live";

type DialogState =
  | null
  | { kind: "create" }
  | { kind: "edit"; board: LiveBoard };

export function LiveHome() {
  const { gotoBoard } = useRoute();
  const {
    boards,
    loading,
    error,
    create,
    rename,
    updateJql,
    updateColumns,
    updateProfile,
    updateViewPrefs,
    togglePin,
    remove,
    refresh,
  } = useLiveBoards();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<LiveBoardFilterChip>("all");
  const [recentActivity, setRecentActivity] = useState<LiveActivityRailEntry[]>(
    [],
  );

  const recordActivity = useCallback((entry: LiveActivityRailEntry) => {
    setRecentActivity((prev) => [entry, ...prev].slice(0, 25));
  }, []);

  const openCreateDialog = useCallback(() => {
    setDialog({ kind: "create" });
  }, []);

  const newBoardCommand = useMemo<CommandItem>(
    () => ({
      id: "live.new-board",
      group: "action",
      label: "Live: New board",
      sub: "Live Testing",
      icon: Plus,
      keywords: ["live", "board", "kanban", "new"],
      action: { type: "run", run: openCreateDialog },
    }),
    [openCreateDialog],
  );
  useRegisterCommand(newBoardCommand);

  const handleSubmit = async (payload: BoardBuilderSubmitPayload) => {
    if (dialog?.kind === "create") {
      const created = await create({
        name: payload.name,
        jql: payload.jql,
        columns: payload.columns,
        profile: payload.profile,
        view_prefs: payload.view_prefs,
      });
      if (payload.pinned) {
        // The create endpoint always starts unpinned — toggle to honor builder choice.
        await togglePin(created.id);
      }
      recordActivity({
        id: `act-create-${created.id}-${Date.now()}`,
        summary: `Created board ${created.name}`,
        detail: created.jql,
        at: new Date().toISOString(),
      });
      gotoBoard(created.id);
      return;
    }
    if (dialog?.kind === "edit") {
      const id = dialog.board.id;
      if (payload.name !== dialog.board.name) await rename(id, payload.name);
      if (payload.jql !== dialog.board.jql) await updateJql(id, payload.jql);
      const colsChanged =
        JSON.stringify(payload.columns) !==
        JSON.stringify(dialog.board.columns ?? []);
      if (colsChanged) await updateColumns(id, payload.columns);
      await updateProfile(id, payload.profile);
      await updateViewPrefs(id, payload.view_prefs);
      if (payload.pinned !== dialog.board.pinned) {
        await togglePin(id);
      }
      recordActivity({
        id: `act-update-${id}-${Date.now()}`,
        summary: `Updated board ${payload.name}`,
        at: new Date().toISOString(),
      });
    }
  };

  const handleTogglePin = useCallback(
    async (id: string) => {
      const before = boards.find((b) => b.id === id);
      await togglePin(id);
      if (before) {
        recordActivity({
          id: `act-pin-${id}-${Date.now()}`,
          summary: `${before.pinned ? "Unpinned" : "Pinned"} board ${before.name}`,
          at: new Date().toISOString(),
        });
      }
    },
    [boards, togglePin, recordActivity],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const before = boards.find((b) => b.id === id);
      await remove(id);
      if (before) {
        recordActivity({
          id: `act-del-${id}-${Date.now()}`,
          summary: `Deleted board ${before.name}`,
          at: new Date().toISOString(),
        });
      }
    },
    [boards, remove, recordActivity],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return boards.filter((b) => {
      if (chip === "pinned" && !b.pinned) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) || b.jql.toLowerCase().includes(q)
      );
    });
  }, [boards, query, chip]);

  return (
    <div className="flex flex-col h-full">
      <LiveHomeHeader
        onAddBoard={openCreateDialog}
        onRefresh={() => void refresh()}
        refreshing={loading}
      />

      <div className="flex flex-1 min-h-0">
        <section className="flex-1 min-w-0 overflow-y-auto">
          <LiveStatsStrip boards={boards} />
          <LiveBoardFilters
            query={query}
            onQueryChange={setQuery}
            chip={chip}
            onChipChange={setChip}
            total={boards.length}
            visible={filtered.length}
          />

          {loading ? (
            <BoardListSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="mx-4 mb-4 rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-[12px] text-err flex items-center justify-between gap-2"
            >
              <span className="truncate">{error}</span>
              <button
                type="button"
                onClick={() => void refresh()}
                className="underline whitespace-nowrap"
              >
                Retry
              </button>
            </div>
          ) : (
            <LiveBoardsGrid
              boards={filtered}
              totalBeforeFilter={boards.length}
              query={query}
              onOpen={(id) => gotoBoard(id)}
              onTogglePin={(id) => void handleTogglePin(id)}
              onEdit={(board) => setDialog({ kind: "edit", board })}
              onDelete={(id) => void handleDelete(id)}
              onAddBoard={openCreateDialog}
              onClearFilter={() => {
                setQuery("");
                setChip("all");
              }}
            />
          )}
        </section>

        <LiveActivityRail entries={recentActivity} />
      </div>

      {dialog && (
        <BoardBuilderDialog
          initial={dialog.kind === "edit" ? dialog.board : null}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
