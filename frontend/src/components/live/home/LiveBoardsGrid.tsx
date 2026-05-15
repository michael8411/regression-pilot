import { BoardCard } from "../BoardCard";
import { BoardListEmpty } from "../BoardListEmpty";
import { AddBoardTile } from "./AddBoardTile";
import type { LiveBoard } from "@/types/live";

interface Props {
  boards: LiveBoard[];
  /** Total boards before filtering — drives the "all filtered out" message. */
  totalBeforeFilter: number;
  query: string;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onEdit: (board: LiveBoard) => void;
  onDelete: (id: string) => void;
  onAddBoard: () => void;
  onClearFilter: () => void;
}

export function LiveBoardsGrid({
  boards,
  totalBeforeFilter,
  query,
  onOpen,
  onTogglePin,
  onEdit,
  onDelete,
  onAddBoard,
  onClearFilter,
}: Props) {
  // Truly empty — never had any boards. Show the "first board" empty state.
  if (totalBeforeFilter === 0) {
    return (
      <div className="px-4 pb-4">
        <BoardListEmpty onNew={onAddBoard} />
      </div>
    );
  }

  // Filter narrowed everything out — keep the grid scaffold visible.
  if (boards.length === 0) {
    return (
      <div className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          <AddBoardTile onClick={onAddBoard} />
        </div>
        <div className="mt-4 text-center text-[12px] text-ink-muted">
          {query
            ? `No boards match "${query}".`
            : "No boards match this filter."}{" "}
          <button
            type="button"
            onClick={onClearFilter}
            className="underline text-ink hover:text-accent-text"
          >
            Clear filter
          </button>
        </div>
      </div>
    );
  }

  return (
    <ul
      role="list"
      aria-label="Live boards"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 px-4 pb-4"
    >
      {boards.map((b) => (
        <li key={b.id}>
          <BoardCard
            board={b}
            onOpen={onOpen}
            onTogglePin={onTogglePin}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </li>
      ))}
      <li>
        <AddBoardTile onClick={onAddBoard} />
      </li>
    </ul>
  );
}
