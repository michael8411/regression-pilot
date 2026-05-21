import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { RefreshCw } from "@/lib/icons";
import { useBoard } from "./BoardProvider";
import { useOptionalLiveActivityFeed } from "./activity";
import { BoardToolbar } from "./BoardToolbar";
import { BoardColumn } from "./BoardColumn";
import { BoardSwimlane } from "./board/BoardSwimlane";
import {
  resolveBoardColumns,
  type ResolvedColumn,
} from "./board/lib/columnVisibility";
import { groupTicketsByLane } from "./board/lib/laneGrouping";
import type { ColumnModeKey, DensityKey } from "./board";
import type { LiveBoardLaneGrouping } from "@/types/live";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";

interface Props {
  onOpenTicket?: (key: string) => void;
}

export function KanbanBoard({ onOpenTicket }: Props) {
  const board = useBoard();
  const activity = useOptionalLiveActivityFeed();
  const { goto } = useRoute();
  const [toast, setToast] = useState<string | null>(null);

  const initialDensity =
    (board.board?.view_prefs?.density as DensityKey | undefined) ?? "cozy";
  // Layer 1 PR2: default to "all" so new boards land on the full workflow
  // grid by default (matches the FM 3.2.0 QA mockup). Existing boards keep
  // whatever they saved.
  const initialColumnMode =
    (board.board?.view_prefs?.boardColumnMode as ColumnModeKey | undefined) ??
    "all";
  const initialShowEmpty =
    board.board?.view_prefs?.showEmptyNonQaColumns ?? false;
  const initialLane: LiveBoardLaneGrouping =
    board.board?.profile?.laneGrouping ?? "none";

  const [density, setDensity] = useState<DensityKey>(initialDensity);
  const [columnMode, setColumnMode] =
    useState<ColumnModeKey>(initialColumnMode);
  const [showEmpty, setShowEmpty] = useState<boolean>(initialShowEmpty);
  const [laneGrouping, setLaneGrouping] =
    useState<LiveBoardLaneGrouping>(initialLane);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Sync local state with persisted view_prefs when the board reloads (e.g.
  // after the provider applies an auto-lane resolution).
  useEffect(() => {
    if (board.board?.profile?.laneGrouping) {
      setLaneGrouping(board.board.profile.laneGrouping);
    }
  }, [board.board?.profile?.laneGrouping]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const refreshCommand = useMemo<CommandItem>(
    () => ({
      id: "live.refresh",
      group: "action",
      label: "Live: Refresh board",
      sub: "Live Testing",
      icon: RefreshCw,
      keywords: ["live", "refresh", "kanban", "reload"],
      action: { type: "run", run: () => void board.refresh() },
    }),
    [board],
  );
  useRegisterCommand(refreshCommand);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleDragStart = (_e: DragStartEvent) => board.pausePolling();
  const handleDragEnd = async (e: DragEndEvent) => {
    board.resumePolling();
    const { active, over } = e;
    if (!over) return;
    const ticketKey = String(active.id);
    const toStatus = String(over.id);
    const fromStatus = (active.data.current?.from as string) ?? "";
    if (!fromStatus || !toStatus || fromStatus === toStatus) return;

    const rollback = board.optimisticMove(ticketKey, fromStatus, toStatus);
    try {
      await board.transition(ticketKey, toStatus);
      if (activity) {
        void activity.record({
          intent: "ticket_moved",
          summary: `moved ${ticketKey}`,
          detail: `${fromStatus} → ${toStatus}`,
          board_id: board.board?.id ?? null,
          ticket_key: ticketKey,
        });
      }
    } catch (e: any) {
      rollback();
      setToast(e?.message ?? "Could not move ticket");
    }
  };

  const toggleLane = useCallback((laneKey: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(laneKey)) next.delete(laneKey);
      else next.add(laneKey);
      return next;
    });
  }, []);

  if (board.loading && !board.board) {
    return (
      <div className="flex items-center justify-center h-full text-[12px] text-ink-faint">
        Loading board…
      </div>
    );
  }
  if (board.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
        <p className="text-[13px] text-err">Failed: {board.error}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void board.refresh()}
            className="g-btn text-[12px]"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => goto(["live", "home"])}
            className="g-btn text-[12px]"
          >
            Back to boards
          </button>
        </div>
      </div>
    );
  }
  if (!board.board) return null;

  const allTickets = board.tickets;
  if (allTickets.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <BoardToolbar
          columnMode={columnMode}
          onColumnModeChange={setColumnMode}
          density={density}
          onDensityChange={setDensity}
          laneGrouping={laneGrouping}
          onLaneGroupingChange={setLaneGrouping}
          showEmpty={showEmpty}
          onShowEmptyChange={setShowEmpty}
        />
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-[13px] text-ink">No tickets match this board.</p>
          <p className="text-[11.5px] text-ink-faint max-w-[360px]">
            Try broadening the version filter or removing components.
          </p>
        </div>
      </div>
    );
  }

  // Layer 1 PR2: render columns from the saved `workflowColumnOrder`
  // when present (new + hydrated boards), falling back to the legacy
  // `columns` array so older boards keep working until they hydrate.
  const columnOrder =
    board.board.profile?.workflowColumnOrder?.length
      ? board.board.profile.workflowColumnOrder
      : board.board.columns;

  const resolvedColumns: ResolvedColumn[] = resolveBoardColumns({
    columnOrder,
    byStatus: board.byStatus,
    mode: columnMode,
    showEmpty,
    qaStatusOverride: board.board.profile?.qaStatusMap,
  });

  return (
    <div className="flex flex-col h-full">
      <BoardToolbar
        columnMode={columnMode}
        onColumnModeChange={setColumnMode}
        density={density}
        onDensityChange={setDensity}
        laneGrouping={laneGrouping}
        onLaneGroupingChange={setLaneGrouping}
        showEmpty={showEmpty}
        onShowEmptyChange={setShowEmpty}
      />
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => board.resumePolling()}
        >
          {laneGrouping === "none" ? (
            <div className="flex gap-3 p-3 h-full">
              {resolvedColumns.map((col) => (
                <BoardColumn
                  key={col.status}
                  status={col.status}
                  tickets={board.byStatus[col.status] ?? []}
                  onOpen={onOpenTicket ?? (() => {})}
                  density={density}
                  dim={columnMode === "all" && col.bucket === "other"}
                  // Any empty column renders slim so the workflow grid
                  // stays stable left→right regardless of mode.
                  slim={col.count === 0}
                />
              ))}
            </div>
          ) : (
            <div className="p-3">
              {groupTicketsByLane(allTickets, laneGrouping).map(
                (lane, idx) => (
                  <BoardSwimlane
                    key={lane.laneKey}
                    laneKey={lane.laneKey}
                    laneLabel={lane.laneLabel}
                    laneIndex={idx}
                    tickets={lane.tickets}
                    columnOrder={columnOrder}
                    mode={columnMode}
                    showEmpty={showEmpty}
                    density={density}
                    collapsed={collapsed.has(lane.laneKey)}
                    onToggle={() => toggleLane(lane.laneKey)}
                    onOpen={onOpenTicket ?? (() => {})}
                    qaStatusOverride={board.board!.profile?.qaStatusMap}
                  />
                ),
              )}
            </div>
          )}
        </DndContext>
      </div>
      {toast && (
        <div
          role="alert"
          className="absolute bottom-4 right-4 px-3 py-2 rounded-md border border-err/30 bg-err/[0.06] text-err text-[11.5px]"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
