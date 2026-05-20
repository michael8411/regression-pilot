import { Badge, StatusDot } from "@/components/ui";
import type { Session } from "@/types";
import {
  classifySession, getTicketCount, getTestCaseCount, isPushed, relativeTime,
} from "./historyUtils";
import { cn } from "@/lib/cn";

interface Props {
  session: Session;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export function SessionRow({ session, isActive, isSelected, onClick }: Props) {
  const klass = classifySession(session);
  const tx = getTicketCount(session);
  const tc = getTestCaseCount(session);

  const statusBadge =
    isPushed(session)        ? <Badge tone="ok"      size="sm">Pushed</Badge>     :
    klass === "generated"    ? <Badge tone="accent"  size="sm">Generated</Badge>  :
                               <Badge tone="neutral" size="sm">Draft</Badge>;

  return (
    <li role="option" aria-selected={isSelected}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full text-left flex flex-col gap-1 px-4 py-3 border-b border-subtle transition-colors",
          isSelected ? "bg-accent/5" : "hover:bg-surface-overlay",
        )}
      >
        <div className="flex items-center gap-2">
          {isActive && <StatusDot tone="ok" size="sm" aria-label="Active session" />}
          <span className="text-sm font-medium text-ink truncate">
            {session.project_key} · {session.version_name ?? "—"}
          </span>
          <span className="ml-auto text-[11px] text-ink-muted shrink-0">
            {relativeTime(session.updated_at)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          <span className="text-[11px] text-ink-muted">
            {tx} ticket{tx === 1 ? "" : "s"}
            {tc > 0 ? ` · ${tc} case${tc === 1 ? "" : "s"}` : ""}
          </span>
        </div>
      </button>
    </li>
  );
}
