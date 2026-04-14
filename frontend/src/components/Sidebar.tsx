import { clsx } from "clsx";
import {
  Settings,
  FolderSearch,
  Sparkles,
  ClipboardCheck,
  MessageSquare,
  Crosshair,
} from "lucide-react";
import type { AppView } from "@/types";

interface SidebarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  jiraReady: boolean;
  hasTickets: boolean;
  hasTestCases: boolean;
}

const NAV_ITEMS: { view: AppView; label: string; icon: any; needsJira?: boolean; needsTickets?: boolean; needsTestCases?: boolean }[] = [
  { view: "setup", label: "Config", icon: Settings },
  { view: "select", label: "Tickets", icon: FolderSearch, needsJira: true },
  { view: "generate", label: "Generate", icon: Sparkles, needsTickets: true },
  { view: "review", label: "Review", icon: ClipboardCheck, needsTestCases: true },
  { view: "chat", label: "Chat", icon: MessageSquare, needsJira: true },
];

export function Sidebar({ currentView, onNavigate, jiraReady, hasTickets, hasTestCases }: SidebarProps) {
  return (
    <aside className="w-[200px] h-full flex flex-col border-r border-white/[0.05] bg-[rgba(8,9,13,0.5)] backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div className="flex justify-center items-center w-7 h-7 bg-gradient-to-br rounded-lg from-accent-dim to-accent shadow-glow-sm">
          <Crosshair size={14} strokeWidth={2.5} className="text-white" />
        </div>
        <div className="leading-none">
          <span className="text-[13px] font-semibold tracking-tight text-white/90">Regression</span>
          <span className="block text-[9px] font-medium tracking-[0.15em] uppercase text-accent-light/40 mt-0.5">Pilot</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 mt-1">
        <p className="text-[9px] font-semibold tracking-[0.15em] uppercase text-ink-muted px-2 mb-2">Workflow</p>
        {NAV_ITEMS.map(({ view, label, icon: Icon, needsJira, needsTickets, needsTestCases }, i) => {
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
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium transition-all duration-150",
                active
                  ? "bg-accent/[0.12] text-accent-light shadow-sm border border-accent/[0.15]"
                  : disabled
                  ? "text-white/[0.10] cursor-not-allowed"
                  : "text-ink-secondary hover:text-ink hover:bg-white/[0.03]"
              )}
            >
              <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
              {label}
              {/* Step indicator */}
              <span className={clsx(
                "ml-auto font-mono tabular-nums text-[9px]",
                active ? "text-accent/60" : "text-ink-faint"
              )}>
                {String(i + 1).padStart(2, "0")}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Connection Indicator */}
      <div className="px-5 py-4 border-t border-white/[0.04]">
        <div className="flex gap-2 items-center">
          <span className={clsx(
            "w-1.5 h-1.5 rounded-full",
            jiraReady ? "bg-ok shadow-[0_0_6px_rgba(52,211,153,0.4)]" : "bg-err/60"
          )} />
          <span className="text-[10px] text-ink-muted font-medium">
            {jiraReady ? "Jira connected" : "Not connected"}
          </span>
        </div>
        <p className="text-[9px] text-ink-faint mt-1 font-mono">Gemini 2.5 Flash</p>
      </div>
    </aside>
  );
}
