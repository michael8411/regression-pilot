import { type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Kbd, KbdPill, StatusDot } from "@/components/ui";
import {
  ClipboardList,
  History,
  Kanban,
  Layers,
  LayoutGrid,
  MessageSquare,
  Pin,
  Settings,
  Sparkles,
  type IconComponent,
} from "@/lib/icons";
import { useRoute } from "@/contexts/RouteContext";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { routeEq, type Route, type SessionChipData, type Workspace } from "@/types/routing";

export interface SidebarProps {
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  jiraReady: boolean;
  geminiReady: boolean;
  zephyrReady: boolean;
  version: string;
  modelName: string;
  /** Optional session metadata surfaced in the Regression contextual nav. */
  session?: SessionChipData | null;
}

interface NavItem {
  label: string;
  icon: IconComponent;
  route: Route;
  sub?: string;
  ai?: boolean;
}

const WORKSPACES: {
  id: Workspace;
  label: string;
  icon: IconComponent;
  kbd: string;
}[] = [
  { id: "regression", label: "Regression",   icon: ClipboardList,  kbd: "G R" },
  { id: "live",       label: "Live Testing", icon: Kanban,         kbd: "G L" },
  { id: "assistant",  label: "Assistant",    icon: MessageSquare,  kbd: "G A" },
];

function regressionContextItems(session: SessionChipData | null | undefined): NavItem[] {
  const items: NavItem[] = [
    { label: "Home", icon: LayoutGrid, route: ["regression", "home"] },
  ];
  if (session) {
    items.push({
      label: "Current Session",
      icon: ClipboardList,
      route: ["regression", "workbench"],
      sub: `${session.project} ${session.version}`,
    });
  }
  items.push({ label: "Test Cycles", icon: Layers, route: ["regression", "cycles"] });
  return items;
}

function liveContextItems(): NavItem[] {
  return [
    { label: "Boards",         icon: Kanban, route: ["live", "home"] },
    { label: "Pinned tickets", icon: Pin,    route: ["live", "pinned"] },
  ];
}

function assistantContextItems(): NavItem[] {
  return [
    { label: "New conversation", icon: Sparkles, ai: true, route: ["assistant", "home"] },
  ];
}

export function Sidebar({
  onOpenHistory,
  onOpenSettings,
  jiraReady,
  geminiReady,
  zephyrReady,
  version,
  modelName,
  session,
}: SidebarProps) {
  const { route, workspace, goto, gotoWorkspace } = useRoute();

  useKeyboardShortcut("G R", () => gotoWorkspace("regression"));
  useKeyboardShortcut("G L", () => gotoWorkspace("live"));
  useKeyboardShortcut("G A", () => gotoWorkspace("assistant"));
  useKeyboardShortcut("G H", () => onOpenHistory?.());
  useKeyboardShortcut(",",   () => onOpenSettings?.());

  const contextItems =
    workspace === "regression" ? regressionContextItems(session)
    : workspace === "live"      ? liveContextItems()
    : workspace === "assistant" ? assistantContextItems()
    : [];

  return (
    <aside className="flex flex-col w-[230px] h-full px-3 py-4 border-r border-subtle bg-surface-panel shrink-0">
      <Brand />

      <div className="t-label px-2 pt-2 pb-1">Workspace</div>
      <nav className="flex flex-col gap-0.5">
        {WORKSPACES.filter(
          (w) => w.id !== "live" || isFeatureEnabled("liveTestingV2"),
        ).map((w) => {
          const Icon = w.icon;
          const active = workspace === w.id;
          return (
            <NavRow
              key={w.id}
              icon={<Icon size={15} strokeWidth={active ? 2.2 : 1.8} />}
              label={w.label}
              trailing={<KbdPill keys={w.kbd} />}
              active={active}
              onClick={() => gotoWorkspace(w.id)}
            />
          );
        })}
      </nav>

      <div className="t-label px-2 pt-5 pb-1">
        {workspace === "assistant" ? "Recent" : "Workflow"}
      </div>
      <nav className="flex flex-col gap-0.5">
        {contextItems.map((it) => {
          const Icon = it.icon;
          return (
            <NavRow
              key={`${it.route[0]}-${it.route[1] ?? ""}-${it.label}`}
              icon={<Icon size={14} />}
              label={it.label}
              sub={it.sub}
              ai={it.ai}
              active={routeEq(route, it.route)}
              onClick={() => goto(it.route)}
            />
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-0.5">
        <NavRow
          icon={<History size={15} />}
          label="History"
          trailing={<KbdPill keys="G H" />}
          onClick={() => onOpenHistory?.()}
        />
        <NavRow
          icon={<Settings size={15} />}
          label="Settings"
          trailing={<Kbd>,</Kbd>}
          onClick={() => onOpenSettings?.()}
        />
      </div>

      <div className="h-px bg-subtle my-3" />

      <ConnectionFooter
        jiraReady={jiraReady}
        geminiReady={geminiReady}
        zephyrReady={zephyrReady}
        modelName={modelName}
        version={version}
      />
    </aside>
  );
}
Sidebar.displayName = "Sidebar";

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2 pb-3">
      <div className="flex justify-center items-center w-[30px] h-[30px] bg-gradient-to-br rounded-lg from-accent/80 to-accent shadow-glow-sm">
        <span className="text-[11px] font-mono font-semibold text-white tracking-[-0.06em] leading-none">
          td
        </span>
      </div>
      <span className="text-[13px] font-semibold tracking-tight text-ink">
        Testdeck
      </span>
    </div>
  );
}

interface NavRowProps {
  icon: ReactNode;
  label: string;
  sub?: string;
  trailing?: ReactNode;
  active?: boolean;
  ai?: boolean;
  onClick?: () => void;
}

function NavRow({ icon, label, sub, trailing, active, ai, onClick }: NavRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 w-full",
        "px-2.5 py-2 rounded-lg text-left",
        "transition-colors duration-fast ease-smooth",
        "border-l-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        active
          ? "bg-accent/10 text-ink border-l-accent"
          : "border-l-transparent text-ink-secondary hover:bg-surface-overlay hover:text-ink",
        ai && !active &&
          "bg-gradient-to-br from-accent/5 to-ai/5 border border-ai/20 text-ink",
      )}
    >
      <span className={cn("shrink-0", ai ? "text-ai" : "")}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block t-nav truncate">{label}</span>
        {sub && (
          <span className="block font-mono t-meta text-ink-muted truncate">{sub}</span>
        )}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </button>
  );
}

interface ConnectionFooterProps {
  jiraReady: boolean;
  geminiReady: boolean;
  zephyrReady: boolean;
  modelName: string;
  version: string;
}

function ConnectionFooter({
  jiraReady,
  geminiReady,
  zephyrReady,
  modelName,
  version,
}: ConnectionFooterProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1.5">
        <StatusDot tone={jiraReady   ? "ok" : "err"}  size="sm" aria-label="Jira" />
        <StatusDot tone={geminiReady ? "ok" : "warn"} size="sm" aria-label="AI" />
        <StatusDot tone={zephyrReady ? "ok" : "warn"} size="sm" aria-label="Zephyr" />
        <span className="font-mono text-[10px] text-ink-muted ml-1">
          Jira · AI · Zephyr
        </span>
      </div>
      <div className="flex justify-between font-mono text-[10px] text-ink-faint px-1.5 pt-1">
        <span>{modelName}</span>
        <span>{version}</span>
      </div>
    </div>
  );
}
