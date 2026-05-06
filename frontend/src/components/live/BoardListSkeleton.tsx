export function BoardListSkeleton() {
  return (
    <ul
      className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4"
      aria-label="Loading boards"
    >
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="h-28 rounded-xl bg-surface-overlay/50 animate-pulse"
        />
      ))}
    </ul>
  );
}
