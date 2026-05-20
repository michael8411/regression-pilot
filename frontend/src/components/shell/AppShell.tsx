import { useMemo, type ReactNode } from "react";
import { useRoute } from "@/contexts/RouteContext";
import type { SessionChipData } from "@/types/routing";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import { TopBar } from "./TopBar";

export interface AppShellProps {
  children: ReactNode;
  session?: SessionChipData | null;
  crumbs: ReactNode[];
  rightSlot?: ReactNode;
  onCmdK?: () => void;
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  onOpenProfile?: () => void;
  jiraReady: boolean;
  geminiReady: boolean;
  zephyrReady: boolean;
  version: string;
  modelName: string;
}

export function AppShell({
  children,
  session,
  crumbs,
  rightSlot,
  onCmdK,
  onOpenHistory,
  onOpenSettings,
  onOpenProfile,
  jiraReady,
  geminiReady,
  zephyrReady,
  version,
  modelName,
}: AppShellProps) {
  const { route } = useRoute();
  const routeKey = useMemo(() => route.join(":"), [route]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-surface-base text-ink">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          onOpenHistory={onOpenHistory}
          onOpenSettings={onOpenSettings}
          jiraReady={jiraReady}
          geminiReady={geminiReady}
          zephyrReady={zephyrReady}
          version={version}
          modelName={modelName}
          session={session ?? null}
        />
        <main className="flex flex-col flex-1 min-w-0 min-h-0">
          <TopBar
            crumbs={crumbs}
            session={session ?? null}
            rightSlot={rightSlot}
            onCmdK={onCmdK}
            onOpenProfile={onOpenProfile}
          />
          <div
            key={routeKey}
            className="flex-1 min-h-0 overflow-auto animate-fade-in"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
AppShell.displayName = "AppShell";
