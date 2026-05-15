/**
 * Phase 02: matches the grid breakpoints used by `LiveBoardsGrid`
 * (1 / 2 / 2 / 3 cols) so the skeleton settles into the same shape the
 * board cards take after load.
 */
export function BoardListSkeleton() {
  return (
    <ul
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 px-4 pb-4"
      aria-label="Loading boards"
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li
          key={i}
          className="h-28 rounded-xl bg-surface-overlay/50 animate-pulse"
        />
      ))}
    </ul>
  );
}
