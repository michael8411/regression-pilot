/**
 * Phase 05 — board toolbar.
 *
 * Thin adapter that pulls board context state and delegates rendering to
 * <BoardViewHeader>. Kept as a named export so existing imports continue
 * to compile.
 */

import { useBoard } from "./BoardProvider";
import {
  BoardViewHeader,
  type ColumnModeKey,
  type DensityKey,
} from "./board";

interface Props {
  columnMode: ColumnModeKey;
  onColumnModeChange: (next: ColumnModeKey) => void;
  density: DensityKey;
  onDensityChange: (next: DensityKey) => void;
}

export function BoardToolbar({
  columnMode,
  onColumnModeChange,
  density,
  onDensityChange,
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
    />
  );
}
