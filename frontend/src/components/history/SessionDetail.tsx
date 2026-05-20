import { Button } from "@/components/ui";
import { Trash2, RotateCcw } from "@/lib/icons";
import type { Session } from "@/types";
import {
  classifySession, getTicketCount, getTestCaseCount, getThemeCount,
  isPushed, relativeTime,
} from "./historyUtils";

interface Props {
  session: Session | null;
  isActive: boolean;
  busy: boolean;
  onRestore: (s: Session) => void;
  onDelete:  (s: Session) => void;
}

export function SessionDetail({ session, isActive, busy, onRestore, onDelete }: Props) {
  if (!session) {
    return (
      <div className="border-t border-subtle p-4 text-sm text-ink-muted">
        Select a session to see details.
      </div>
    );
  }

  const tx = getTicketCount(session);
  const tc = getTestCaseCount(session);
  const themes = getThemeCount(session);
  const pushed = isPushed(session);
  const klass = classifySession(session);

  return (
    <div className="border-t border-subtle p-4 space-y-3 bg-surface">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="t-title text-ink truncate">
            {session.project_key} · {session.version_name ?? "—"}
          </h3>
          <p className="t-meta text-ink-muted">
            {isActive ? "Active session · " : ""}
            Updated {relativeTime(session.updated_at)}
          </p>
        </div>
        <Tag>{klass}</Tag>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <Item label="Created"     value={new Date(session.created_at).toLocaleString()} />
        <Item label="Status"      value={session.status || "—"} />
        <Item label="Tickets"     value={String(tx)} />
        <Item label="Test cases"  value={String(tc)} />
        <Item label="Themes"      value={String(themes)} />
        <Item label="Pushed"      value={pushed ? "Yes" : "No"} />
      </dl>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="danger" size="sm" leading={<Trash2 size={13} />}
          disabled={busy}
          onClick={() => onDelete(session)}
        >
          Delete
        </Button>
        <Button
          variant="primary" size="sm" leading={<RotateCcw size={13} />}
          loading={busy}
          disabled={isActive || busy}
          onClick={() => onRestore(session)}
        >
          {isActive ? "Already active" : "Restore"}
        </Button>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="t-label text-ink-muted">{label}</dt>
      <dd className="text-ink-secondary truncate">{value}</dd>
    </>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] px-2 py-0.5 rounded bg-surface-overlay text-ink-muted shrink-0">
      {children}
    </span>
  );
}
