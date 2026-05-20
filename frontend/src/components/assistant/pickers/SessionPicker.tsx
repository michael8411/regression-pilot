import { useEffect, useState } from "react";
import { Folder, Loader2 } from "@/lib/icons";
import { listSessions } from "@/lib/api";
import type { Session } from "@/types";
import { PickerModal } from "./PickerModal";

interface Props {
  onPick: (sessionId: string) => void;
  onClose: () => void;
}

export function SessionPicker({ onPick, onClose }: Props) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listSessions();
        if (!cancelled) setSessions(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load sessions");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PickerModal title="Attach session" onClose={onClose}>
      {error ? (
        <p className="text-[12px] text-err">{error}</p>
      ) : sessions === null ? (
        <div className="flex items-center gap-2 text-[12px] text-ink-muted">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-[12px] text-ink-muted">No sessions yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-overlay text-left"
              >
                <Folder size={11} className="text-accent-text shrink-0" />
                <span className="font-medium text-[12px] text-ink">
                  {s.project_key}
                  {s.version_name ? ` ${s.version_name}` : ""}
                </span>
                <span className="text-[10.5px] text-ink-faint ml-auto">
                  {new Date(s.updated_at).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PickerModal>
  );
}
