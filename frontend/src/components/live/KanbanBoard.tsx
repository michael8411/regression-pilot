import { useEffect, useMemo, useState } from "react";
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
import { resolveColumns } from "./lib/statusColumns";
import { BoardToolbar } from "./BoardToolbar";
import { BoardColumn } from "./BoardColumn";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";

interface Props {
  /** Click handler from LiveWorkspace; 8d wires to drawer open. */
  onOpenTicket?: (key: string) => void;
}

export function KanbanBoard({ onOpenTicket }: Props) {
  const board = useBoard();
  const { goto } = useRoute();
  const [toast, setToast] = useState<string | null>(null);
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
    } catch (e: any) {
      rollback();
      setToast(e?.message ?? "Could not move ticket");
    }
  };

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

  const columns = resolveColumns(board.board.columns, board.byStatus);

  return (
    <div className="flex flex-col h-full">
      <BoardToolbar />
      <div className="flex-1 overflow-x-auto">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => board.resumePolling()}
        >
          <div className="flex gap-3 p-3 h-full">
            {columns.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                tickets={board.byStatus[status] ?? []}
                onOpen={onOpenTicket ?? (() => {})}
              />
            ))}
          </div>
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
