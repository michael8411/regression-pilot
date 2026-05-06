import type { Session } from "@/types";
import { SessionRow } from "./SessionRow";

interface Props {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

export function SessionList({
  sessions, loading, error, activeId, selectedId, onSelect, onRetry,
}: Props) {
  if (loading) return <Skeleton />;
  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-err">{error}</p>
        <button type="button" onClick={onRetry} className="mt-2 text-xs underline text-accent-text">
          Retry
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-ink-muted">
        No sessions match these filters yet.
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto" role="listbox" aria-label="Saved sessions">
      {sessions.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          isActive={s.id === activeId}
          isSelected={s.id === selectedId}
          onClick={() => onSelect(s.id)}
        />
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <div className="p-2 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 rounded bg-surface-overlay animate-pulse" />
      ))}
    </div>
  );
}
