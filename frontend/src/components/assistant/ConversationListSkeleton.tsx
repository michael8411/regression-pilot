export function ConversationListSkeleton() {
  return (
    <ul
      className="flex flex-col gap-1 p-2"
      aria-label="Loading conversations"
    >
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-12 rounded-lg bg-surface-overlay/50 animate-pulse"
        />
      ))}
    </ul>
  );
}
