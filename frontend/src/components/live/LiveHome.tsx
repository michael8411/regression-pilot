import { useMemo, useState } from "react";
import { Plus } from "@/lib/icons";
import { useLiveBoards } from "@/components/live/hooks/useLiveBoards";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import { BoardCard } from "./BoardCard";
import { BoardCreateDialog } from "./BoardCreateDialog";
import { BoardListEmpty } from "./BoardListEmpty";
import { BoardListSkeleton } from "./BoardListSkeleton";
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
    togglePin,
    remove,
    refresh,
  } = useLiveBoards();
  const [dialog, setDialog] = useState<DialogState>(null);

  const newBoardCommand = useMemo<CommandItem>(
    () => ({
      id: "live.new-board",
      group: "action",
      label: "Live: New board",
      sub: "Live Testing",
      icon: Plus,
      keywords: ["live", "board", "kanban", "new"],
      action: {
        type: "run",
        run: () => setDialog({ kind: "create" }),
      },
    }),
    [],
  );
  useRegisterCommand(newBoardCommand);

  const handleSubmit = async (body: {
    name: string;
    jql: string;
    columns?: string[];
  }) => {
    if (dialog?.kind === "create") {
      const created = await create(body);
      gotoBoard(created.id);
      return;
    }
    if (dialog?.kind === "edit") {
      const id = dialog.board.id;
      if (body.name !== dialog.board.name) await rename(id, body.name);
      if (body.jql !== dialog.board.jql) await updateJql(id, body.jql);
      // columns update — patch directly via the hook's API surface
      const colsChanged =
        JSON.stringify(body.columns ?? []) !==
        JSON.stringify(dialog.board.columns ?? []);
      if (colsChanged && body.columns) {
        const { patchLiveBoard } = await import(
          "@/components/live/lib/api"
        );
        await patchLiveBoard(id, { columns: body.columns });
        await refresh();
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <div>
          <h1 className="text-[14px] font-semibold text-ink">Live Testing</h1>
          <p className="text-[11px] text-ink-faint">
            Boards you are actively testing. Click to open the Kanban view.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ kind: "create" })}
          className="g-btn-solid text-[12px] px-3 py-1.5 flex items-center gap-1.5"
        >
          <Plus size={11} /> New board
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <BoardListSkeleton />
        ) : error ? (
          <div className="p-6 text-[12px] text-err">
            {error}
            <button
              type="button"
              onClick={() => void refresh()}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        ) : boards.length === 0 ? (
          <BoardListEmpty onNew={() => setDialog({ kind: "create" })} />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
            {boards.map((b) => (
              <li key={b.id}>
                <BoardCard
                  board={b}
                  onOpen={(id) => gotoBoard(id)}
                  onTogglePin={togglePin}
                  onEdit={(board) => setDialog({ kind: "edit", board })}
                  onDelete={(id) => void remove(id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog && (
        <BoardCreateDialog
          initial={dialog.kind === "edit" ? dialog.board : null}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
