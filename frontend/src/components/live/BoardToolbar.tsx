import { useBoard } from "./BoardProvider";
import {
  BoardViewHeader,
  type ColumnModeKey,
  type DensityKey,
} from "./board";
import type { LiveBoardLaneGrouping } from "@/types/live";

interface Props {
  columnMode: ColumnModeKey;
  onColumnModeChange: (next: ColumnModeKey) => void;
  density: DensityKey;
  onDensityChange: (next: DensityKey) => void;
  laneGrouping: LiveBoardLaneGrouping;
  onLaneGroupingChange: (next: LiveBoardLaneGrouping) => void;
  showEmpty: boolean;
  onShowEmptyChange: (next: boolean) => void;
}

export function BoardToolbar({
  columnMode,
  onColumnModeChange,
  density,
  onDensityChange,
  laneGrouping,
  onLaneGroupingChange,
  showEmpty,
  onShowEmptyChange,
}: Props) {
  const { board, fetchedAt, loading, refresh } = useBoard();
  if (!board) return null;

  return (
    <BoardViewHeader
      board={board}
      fetchedAt={fetchedAt}
      refreshing={loading}
      onRefresh={() => void refresh()}
      columnMode={columnMode}
      onColumnModeChange={onColumnModeChange}
      density={density}
      onDensityChange={onDensityChange}
      laneGrouping={laneGrouping}
      onLaneGroupingChange={onLaneGroupingChange}
      showEmpty={showEmpty}
      onShowEmptyChange={onShowEmptyChange}
    />
  );
}
