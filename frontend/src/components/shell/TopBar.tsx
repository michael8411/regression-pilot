import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Avatar, IconButton, KbdPill, StatusDot } from "@/components/ui";
import { HelpCircle, Search } from "@/lib/icons";
import { formatRelativeTime } from "@/lib/time";
import type { SessionChipData } from "@/types/routing";

export interface TopBarProps {
  crumbs: ReactNode[];
  session: SessionChipData | null;
  rightSlot?: ReactNode;
  onCmdK?: () => void;
  onOpenProfile?: () => void;
}

export function TopBar({ crumbs, session, rightSlot, onCmdK, onOpenProfile }: TopBarProps) {
  return (
    <header className="flex items-center gap-4 h-12 px-4 border-b border-subtle bg-surface-panel shrink-0">
      <nav className="flex items-center gap-1.5 flex-1 min-w-0" aria-label="Breadcrumb">
        {crumbs.map((c, i, arr) => {
          const last = i === arr.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && <span className="text-ink-faint text-[12px]">/</span>}
              <span
                className={cn(
                  "text-[12.5px]",
                  last
                    ? "text-ink font-medium truncate"
                    : "text-ink-secondary font-normal",
                )}
              >
                {c}
              </span>
            </Fragment>
          );
        })}
      </nav>

      {session && (
        <button
          type="button"
          onClick={() => {
            /* Phase 5: open session details popover. No-op in Phase 2. */
          }}
          className={cn(
            "hidden min-[1200px]:inline-flex items-center gap-2 px-2.5 h-7 rounded-full",
            "bg-surface-overlay border border-subtle",
            "text-[11px] text-ink-secondary font-medium",
            "hover:bg-surface-elevated hover:border-strong",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            "transition-colors duration-fast ease-smooth",
          )}
          aria-label="Current session"
          title="Click for session details"
        >
          <StatusDot tone="ai" size="sm" pulse />
          <span className="font-mono">{session.project}-{session.version}</span>
          <span className="text-ink-faint">·</span>
          <span>{session.ticketCount} tickets</span>
          <span className="text-ink-faint">·</span>
          <span>{session.themeCount} themes</span>
          {session.lastSavedAt && (
            <>
              <span className="text-ink-faint">·</span>
              <span>saved {formatRelativeTime(session.lastSavedAt)}</span>
            </>
          )}
        </button>
      )}

      <div className="flex items-center gap-2 shrink-0">
        {rightSlot}
        <button
          type="button"
          onClick={onCmdK}
          className={cn(
            "inline-flex items-center gap-2 h-7 w-[220px] px-2",
            "rounded-lg border border-muted bg-surface-overlay",
            "text-[11px] text-ink-muted",
            "hover:border-strong hover:bg-surface-elevated",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            "transition-colors duration-fast ease-smooth",
          )}
          aria-label="Open command palette"
        >
          <Search size={14} className="text-ink-muted" />
          <span className="flex-1 text-left">Search or run…</span>
          <KbdPill keys="Mod K" />
        </button>
        <IconButton aria-label="Help" tooltip="Help" icon={<HelpCircle />} />
        <button
          type="button"
          onClick={onOpenProfile}
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-lg",
            "hover:bg-surface-overlay",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            "transition-colors duration-fast ease-smooth",
          )}
          aria-label="Profile"
        >
          <Avatar a={{ initials: "AR", hue: 170 }} size={24} />
        </button>
      </div>
    </header>
  );
}
TopBar.displayName = "TopBar";
