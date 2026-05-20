import { BrandTile } from "@/components/live/visual";
import {
  BoardViewControls,
  type ColumnModeKey,
  type DensityKey,
} from "./BoardViewControls";
import type { LiveBoard, LiveBoardLaneGrouping } from "@/types/live";

interface Props {
  board: LiveBoard;
  fetchedAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;

  columnMode: ColumnModeKey;
  onColumnModeChange: (next: ColumnModeKey) => void;
  density: DensityKey;
  onDensityChange: (next: DensityKey) => void;
  laneGrouping: LiveBoardLaneGrouping;
  onLaneGroupingChange: (next: LiveBoardLaneGrouping) => void;
  showEmpty: boolean;
  onShowEmptyChange: (next: boolean) => void;
}

function inferProjectKey(board: LiveBoard): string {
  if (board.profile?.projectKey) return board.profile.projectKey;
  const m = /project\s*(?:=|in)\s*["']?([A-Z][A-Z0-9]{1,9})["']?/i.exec(
    board.jql,
  );
  return m ? m[1].toUpperCase() : "";
}

export function BoardViewHeader({
  board,
  fetchedAt,
  refreshing,
  onRefresh,
  columnMode,
  onColumnModeChange,
  density,
  onDensityChange,
  laneGrouping,
  onLaneGroupingChange,
  showEmpty,
  onShowEmptyChange,
}: Props) {
  const projectKey = inferProjectKey(board);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-subtle bg-surface">
      <div className="flex items-start gap-2.5 min-w-0">
        {projectKey && <BrandTile projectKey={projectKey} size={32} />}
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-ink truncate">
            {board.name}
          </h2>
          <code className="block text-[10.5px] text-ink-faint truncate font-mono">
            {board.jql}
          </code>
        </div>
      </div>

      <BoardViewControls
        columnMode={columnMode}
        onColumnModeChange={onColumnModeChange}
        density={density}
        onDensityChange={onDensityChange}
        laneGrouping={laneGrouping}
        onLaneGroupingChange={onLaneGroupingChange}
        showEmpty={showEmpty}
        onShowEmptyChange={onShowEmptyChange}
        onRefresh={onRefresh}
        refreshing={refreshing}
        fetchedAt={fetchedAt}
      />
    </div>
  );
}
