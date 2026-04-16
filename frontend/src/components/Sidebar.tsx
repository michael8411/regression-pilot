import { clsx } from "clsx";
import {
  Settings,
  FolderSearch,
  Sparkles,
  ClipboardCheck,
  MessageSquare,
} from "lucide-react";
import type { AppView } from "@/types";

interface SidebarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  jiraReady: boolean;
  hasTickets: boolean;
  hasTestCases: boolean;
}

const NAV_ITEMS: {
  view: AppView;
  label: string;
  icon: any;
  needsJira?: boolean;
  needsTickets?: boolean;
  needsTestCases?: boolean;
}[] = [
  { view: "setup", label: "Config", icon: Settings },
  { view: "select", label: "Tickets", icon: FolderSearch, needsJira: true },
  { view: "generate", label: "Generate", icon: Sparkles, needsTickets: true },
  {
    view: "review",
    label: "Review",
    icon: ClipboardCheck,
    needsTestCases: true,
  },
  { view: "chat", label: "Chat", icon: MessageSquare, needsJira: true },
];

export function Sidebar({
  currentView,
  onNavigate,
  jiraReady,
  hasTickets,
  hasTestCases,
}: SidebarProps) {
  return (
    <aside className="w-[200px] h-full flex flex-col border-r border-subtle bg-surface-panel">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div className="flex justify-center items-center w-7 h-7 bg-gradient-to-br rounded-lg from-accent/80 to-accent shadow-glow-sm">
          <span className="text-[11px] font-mono font-semibold text-white tracking-[-0.06em] leading-none">td</span>
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-ink">
          Testdeck
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 mt-1">
        <p className="text-[9px] font-medium tracking-[0.15em] uppercase text-ink-muted px-2 mb-2">
          Workflow
        </p>
        {NAV_ITEMS.map(
          (
            {
              view,
              label,
              icon: Icon,
              needsJira,
              needsTickets,
              needsTestCases,
            },
            i,
          ) => {
            const disabled =
              (needsJira && !jiraReady) ||
              (needsTickets && !hasTickets) ||
              (needsTestCases && !hasTestCases);

            const active = currentView === view;

            return (
              <button
                key={view}
                onClick={() => !disabled && onNavigate(view)}
                disabled={disabled}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium transition-all duration-150 border-l-2",
                  active
                    ? "bg-accent-dim text-accent-text border-l-accent"
                    : disabled
                      ? "text-ink-muted opacity-40 cursor-not-allowed border-l-transparent"
                      : "text-ink-secondary hover:text-ink hover:bg-surface-overlay border-l-transparent",
                )}
              >
                <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                {label}
                {/* Step indicator */}
                <span
                  className={clsx(
                    "ml-auto font-mono tabular-nums text-[11px]",
                    active ? "text-accent-text/60" : "text-ink-muted",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </button>
            );
          },
        )}
      </nav>

      {/* Connection Indicator */}
      <div className="px-5 py-4 border-t border-subtle">
        <div className="flex gap-2 items-center">
          <span
            className={clsx(
              "w-1.5 h-1.5 rounded-full",
              jiraReady
                ? "bg-ok shadow-[0_0_6px_rgba(34,197,94,0.4)]"
                : "bg-err/60",
            )}
          />
          <span className="text-[10px] text-ink-muted font-medium">
            {jiraReady ? "Jira connected" : "Not connected"}
          </span>
        </div>
        <p className="text-[9px] text-ink-muted mt-1 font-mono">
          Gemini 2.5 Flash
        </p>
      </div>
    </aside>
  );
}
