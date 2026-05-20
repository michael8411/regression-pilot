import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SetupView } from "@/components/SetupView";
import { SelectView } from "@/components/SelectView";
import { GenerateView } from "@/components/GenerateView";
import { ReviewView } from "@/components/ReviewView";
import { ChatView } from "@/components/ChatView";
import { useSession } from "@/hooks/useSession";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppView, ChatMessage, ConfigStatus, JiraTicket, PushResult, TestCase } from "@/types";
import {
  AppShell,
  CommandPalette,
  coreCommands,
  useGlobalCommandShortcut,
  useRegisterCommands,
} from "@/components/shell";
import {
  RegressionHome,
  TicketWorkbench,
  ThemeEditor,
  GenerateCases,
  ReviewGrid,
  PushDialog,
} from "@/components/regression";
import { HistoryDrawer } from "@/components/history";
import { SetupWizard } from "@/components/onboarding";
import { AssistantWorkspace } from "@/components/assistant";
import { LiveWorkspace } from "@/components/live";
import { requestOpenCreateDialog as requestOpenMcpDialog } from "@/components/mcp";
import { SettingsOverlay } from "@/components/settings";
import { SignInGate } from "@/components/shell/SignInGate";
import { CyclesView } from "@/components/cycles";
import { getConfigStatus } from "@/lib/api";
import { RouteProvider, useRoute } from "@/contexts/RouteContext";
import {
  CommandRegistryProvider,
  useCommandRegistry,
} from "@/contexts/CommandRegistryContext";
import { isFeatureEnabled } from "@/lib/featureFlags";
import {
  buildCrumbs,
  legacyViewToRoute,
  mapRouteToLegacyView,
  parseRoute,
  type RegressionScreen as RegressionScreenName,
  type Route,
  type SessionChipData,
} from "@/types/routing";

const VALID_VIEWS: AppView[] = ["setup", "select", "generate", "review", "chat"];

function validateRestoredView(
  candidate: string,
  state: Record<string, any>,
): AppView {
  if (!VALID_VIEWS.includes(candidate as AppView)) return "setup";
  const tickets = Array.isArray(state.selectedTickets) ? state.selectedTickets : [];
  const cases = Array.isArray(state.testCases) ? state.testCases : [];

  if (candidate === "review" && cases.length === 0) {
    return tickets.length > 0 ? "generate" : "select";
  }
  if (candidate === "generate" && tickets.length === 0) return "select";
  if (candidate === "chat" && tickets.length === 0) return "select";

  return candidate as AppView;
}

interface ScreenHandlers {
  // Setup
  onStatusResolved: (status: ConfigStatus) => void;
  // Select
  onTicketsSelected: (tickets: JiraTicket[], versionName?: string) => Promise<void>;
  saveState: (key: string, value: unknown) => void;
  // Generate
  tickets: JiraTicket[];
  onGenerated: (cases: TestCase[]) => void;
  onBackFromGenerate: () => void;
  initialInstructions?: string;
  initialGroups?: Record<string, JiraTicket[]>;
  // Review
  testCases: TestCase[];
  projectKey: string;
  onBackFromReview: () => void;
  onUpdateTestCases: (cases: TestCase[]) => void;
  saveStateImmediate: (key: string, value: unknown) => Promise<void>;
  initialPushResult?: PushResult;
  // Chat
  initialMessages?: ChatMessage[];
}

export default function App() {
  const [view, setView] = useState<AppView>("setup");
  const [jiraReady, setJiraReady] = useState(false);
  const [geminiReady, setGeminiReady] = useState(false);
  const [zephyrReady, setZephyrReady] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<JiraTicket[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [projectKey, setProjectKey] = useState("FM");
  const [currentVersionName, setCurrentVersionName] = useState<string | null>(null);
  const [hasAutoRedirected, setHasAutoRedirected] = useState<boolean>(false);
  const [manualSetupOpen, setManualSetupOpen] = useState<boolean>(false);
  const [version, setVersion] = useState<string>("…");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const useNewShell = isFeatureEnabled("workspaceSwitcher");

  const hasRestoredRef = useRef(false);

  const {
    sessionId,
    restoredState,
    isRestoring,
    createSession,
    saveState,
    saveStateImmediate,
    saveStateBatch,
  } = useSession();

  useEffect(() => {
    if (!isFeatureEnabled("onboardingV2")) return;
    let cancelled = false;
    getConfigStatus()
      .then((s) => {
        if (cancelled) return;
        const firstRun = !s.jira.configured && !s.ai.configured;
        const skipped = localStorage.getItem("onboarding.skipped") === "true";
        if (firstRun && !skipped) setWizardOpen(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch("http://localhost:8000/health")
      .then(r => r.json())
      .then(data => {
        if (data.version) setVersion(`v${data.version}`);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (hasRestoredRef.current) return;
    if (!restoredState) return;

    hasRestoredRef.current = true;
    if (Object.keys(restoredState).length === 0) return;

    if (Array.isArray(restoredState.selectedTickets)) {
      setSelectedTickets(restoredState.selectedTickets as JiraTicket[]);
    }
    if (Array.isArray(restoredState.testCases)) {
      setTestCases(restoredState.testCases as TestCase[]);
    }
    if (typeof restoredState.projectKey === "string") {
      setProjectKey(restoredState.projectKey);
    }
    const savedVersion = restoredState.selectedVersion;
    if (
      savedVersion &&
      typeof savedVersion === "object" &&
      typeof savedVersion.name === "string"
    ) {
      setCurrentVersionName(savedVersion.name);
    }
    if (typeof restoredState.currentView === "string") {
      const safeView = validateRestoredView(restoredState.currentView, restoredState);
      setView(safeView);
      if (safeView !== "setup") {
        setHasAutoRedirected(true);
      }
    }
  }, [restoredState]);

  const initialRoute = useMemo<Route>(() => {
    if (!restoredState) return ["regression", "home"];
    const restored = parseRoute(restoredState.currentRoute);
    if (restored) return restored;
    return legacyViewToRoute(restoredState.currentView as AppView | undefined)
      ?? ["regression", "home"];
  }, [restoredState]);

  const handleRouteChange = useCallback(
    (next: Route) => {
      saveState("currentRoute", next);
      const legacy = mapRouteToLegacyView(next);
      if (legacy) saveState("currentView", legacy);
    },
    [saveState],
  );

  if (isRestoring) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-ink-muted">Loading...</div>
      </div>
    );
  }

  const handleStatusResolved = (status: ConfigStatus) => {
    setJiraReady(status.jira.configured);
    setGeminiReady(status.ai.configured);
    setZephyrReady(status.zephyr.configured);

    if (status.jira.configured && !hasAutoRedirected && !manualSetupOpen) {
      setView("select");
      setHasAutoRedirected(true);
    }
  };

  const handleNavigate = (nextView: AppView) => {
    setManualSetupOpen(nextView === "setup");
    setView(nextView);
    saveState("currentView", nextView);
  };

  const handleTicketsSelected = async (
    tickets: JiraTicket[],
    versionName?: string,
  ) => {
    const key = tickets.length > 0 ? tickets[0].key.split("-")[0] : projectKey;
    const resolvedVersion = versionName ?? null;

    const needsNewSession =
      !sessionId ||
      key !== projectKey ||
      resolvedVersion !== currentVersionName;

    setSelectedTickets(tickets);
    setProjectKey(key);
    setCurrentVersionName(resolvedVersion);
    setView("generate");

    if (needsNewSession) {
      await createSession(key, versionName);
    }

    saveStateBatch({
      selectedTickets: tickets,
      projectKey: key,
      currentView: "generate",
    });
  };

  const handleGenerated = (cases: TestCase[]) => {
    setTestCases(cases);
    setView("review");
    saveStateBatch({
      testCases: cases,
      currentView: "review",
    });
  };

  const restoredGroups =
    restoredState &&
    restoredState.editableGroups &&
    typeof restoredState.editableGroups === "object" &&
    !Array.isArray(restoredState.editableGroups)
      ? (restoredState.editableGroups as Record<string, JiraTicket[]>)
      : undefined;

  const handlers: ScreenHandlers = {
    onStatusResolved: handleStatusResolved,
    onTicketsSelected: handleTicketsSelected,
    saveState,
    tickets: selectedTickets,
    onGenerated: handleGenerated,
    onBackFromGenerate: () => setView("select"),
    initialInstructions: restoredState?.instructions as string | undefined,
    initialGroups: restoredGroups,
    testCases,
    projectKey,
    onBackFromReview: () => setView("generate"),
    onUpdateTestCases: setTestCases,
    saveStateImmediate,
    initialPushResult: restoredState?.pushResult as PushResult | undefined,
    initialMessages: restoredState?.chatMessages as ChatMessage[] | undefined,
  };

  const sessionChip: SessionChipData | null =
    selectedTickets.length > 0 && currentVersionName
      ? {
          project: projectKey,
          version: currentVersionName,
          ticketCount: selectedTickets.length,
          themeCount: restoredGroups ? Object.keys(restoredGroups).length : 0,
          lastSavedAt: null,
        }
      : null;

  if (!useNewShell) {
    return (
      <div className="flex h-full">
        <div className="bg-scene" />

        <Sidebar
          currentView={view}
          onNavigate={handleNavigate}
          jiraReady={jiraReady}
          version={version}
          hasTickets={selectedTickets.length > 0}
          hasTestCases={testCases.length > 0}
        />

        <main className="flex overflow-hidden flex-col flex-1">
          <V1TitleBar />

          {view === "setup" && (
            <SetupView onStatusResolved={handleStatusResolved} />
          )}
          {view === "select" && (
            <SelectView
              onTicketsSelected={handleTicketsSelected}
              saveState={saveState}
            />
          )}
          {view === "generate" && (
            <GenerateView
              tickets={selectedTickets}
              onGenerated={handleGenerated}
              onBack={() => setView("select")}
              saveState={saveState}
              initialInstructions={restoredState?.instructions as string | undefined}
              initialGroups={restoredGroups}
            />
          )}
          {view === "review" && (
            <ReviewView
              testCases={testCases}
              projectKey={projectKey}
              onBack={() => setView("generate")}
              onUpdateTestCases={setTestCases}
              saveStateImmediate={saveStateImmediate}
              initialPushResult={restoredState?.pushResult as PushResult | undefined}
            />
          )}
          {view === "chat" && (
            <ChatView
              tickets={selectedTickets}
              saveStateImmediate={saveStateImmediate}
              initialMessages={restoredState?.chatMessages as ChatMessage[] | undefined}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <CommandRegistryProvider>
      <RouteProvider initialRoute={initialRoute} onRouteChange={handleRouteChange}>
        <ShellCommandsBridge />
        <CoreCommandsBridge
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenSetup={() => {
            localStorage.removeItem("onboarding.skipped");
            setWizardOpen(true);
          }}
        />
        <ShellBridge
          handlers={handlers}
          session={sessionChip}
          jiraReady={jiraReady}
          geminiReady={geminiReady}
          zephyrReady={zephyrReady}
          version={version}
          modelName="Gemini 2.5 Flash"
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <CommandPaletteHost />
        {isFeatureEnabled("historyDrawer") && (
          <HistoryDrawer
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
          />
        )}
        {isFeatureEnabled("onboardingV2") && (
          <SetupWizard
            open={wizardOpen}
            onClose={() => {
              localStorage.setItem("onboarding.skipped", "true");
              setWizardOpen(false);
            }}
            onFinish={() => {
              localStorage.removeItem("onboarding.skipped");
              setWizardOpen(false);
            }}
          />
        )}
        {isFeatureEnabled("settingsV2") && <SettingsOverlay />}
        <SignInGateBridge />
      </RouteProvider>
    </CommandRegistryProvider>
  );
}

function ShellCommandsBridge() {
  useGlobalCommandShortcut();
  return null;
}

function SignInGateBridge() {
  const { gotoSettings } = useRoute();
  if (!isFeatureEnabled("oauthSignIn")) return null;
  return <SignInGate onOpenSettings={() => gotoSettings()} />;
}

function CoreCommandsBridge({
  onOpenHistory,
  onOpenSetup,
}: {
  onOpenHistory: () => void;
  onOpenSetup: () => void;
}) {
  const { gotoSettings, gotoSettingsPane } = useRoute();
  const onOpenSettings = useCallback(() => gotoSettings(), [gotoSettings]);
  const onOpenSettingsPane = useCallback(
    (pane: string) => gotoSettingsPane(pane),
    [gotoSettingsPane],
  );
  const onAddMcpConnection = useCallback(() => {
    requestOpenMcpDialog();
    gotoSettingsPane("connections");
  }, [gotoSettingsPane]);

  const commands = useMemo(
    () =>
      coreCommands({
        onOpenSettings,
        onOpenHistory,
        onOpenSetup,
        onOpenSettingsPane,
        onAddMcpConnection,
      }),
    [
      onOpenSettings,
      onOpenHistory,
      onOpenSetup,
      onOpenSettingsPane,
      onAddMcpConnection,
    ],
  );
  useRegisterCommands(commands);
  return null;
}

function CommandPaletteHost() {
  const { open, closePalette } = useCommandRegistry();
  if (!isFeatureEnabled("commandPalette")) return null;
  return <CommandPalette open={open} onClose={closePalette} />;
}

interface ShellBridgeProps {
  handlers: ScreenHandlers;
  session: SessionChipData | null;
  jiraReady: boolean;
  geminiReady: boolean;
  zephyrReady: boolean;
  version: string;
  modelName: string;
  onOpenHistory: () => void;
}

function ShellBridge({
  handlers,
  session,
  jiraReady,
  geminiReady,
  zephyrReady,
  version,
  modelName,
  onOpenHistory,
}: ShellBridgeProps) {
  const { route, gotoSettings } = useRoute();
  const { openPalette } = useCommandRegistry();
  const crumbs = useMemo(() => buildCrumbs(route), [route]);

  return (
    <AppShell
      crumbs={crumbs}
      session={session}
      jiraReady={jiraReady}
      geminiReady={geminiReady}
      zephyrReady={zephyrReady}
      version={version}
      modelName={modelName}
      onOpenHistory={onOpenHistory}
      onOpenSettings={() => gotoSettings()}
      onCmdK={openPalette}
      onOpenProfile={() => {
        /* Later phase. */
      }}
    >
      <CurrentScreen handlers={handlers} />
    </AppShell>
  );
}

function CurrentScreen({ handlers }: { handlers: ScreenHandlers }) {
  const { route } = useRoute();
  const ws = route[0];

  if (ws === "regression") {
    return <RegressionScreen screen={route[1]} handlers={handlers} />;
  }

  if (ws === "live") {
    if (isFeatureEnabled("liveTestingV2")) {
      return <LiveWorkspace />;
    }
    return (
      <div className="p-8 text-center text-[12px] text-ink-faint">
        Live Testing isn't enabled.
      </div>
    );
  }

  if (ws === "assistant") {
    if (isFeatureEnabled("assistantV2")) {
      return <AssistantWorkspace />;
    }
    return (
      <ChatView
        tickets={handlers.tickets}
        saveStateImmediate={handlers.saveStateImmediate}
        initialMessages={handlers.initialMessages}
      />
    );
  }

  if (ws === "settings") {
    return <ComingSoon label="Settings" description="Shipping in Phase 11." />;
  }

  if (ws === "onboarding") {
    return <ComingSoon label="Onboarding" description="Shipping in Phase 6." />;
  }

  return <ComingSoon label="History" description="Shipping in Phase 5." />;
}

function RegressionScreen({
  screen,
  handlers,
}: {
  screen: RegressionScreenName;
  handlers: ScreenHandlers;
}) {
  if (!isFeatureEnabled("regressionV2")) {
    return <LegacyRegressionScreen screen={screen} handlers={handlers} />;
  }
  switch (screen) {
    case "home":
      return <RegressionHome />;
    case "workbench":
      return <TicketWorkbench />;
    case "themes":
      return <ThemeEditor />;
    case "generate":
      return <GenerateCases />;
    case "review":
      return <ReviewGrid />;
    case "push":
      return <PushDialog />;
    case "cycles":
      return isFeatureEnabled("testCycles") ? (
        <CyclesView />
      ) : (
        <ComingSoon label="Test Cycles" description="Shipping in Phase 10." />
      );
  }
}

function LegacyRegressionScreen({
  screen,
  handlers,
}: {
  screen: RegressionScreenName;
  handlers: ScreenHandlers;
}) {
  switch (screen) {
    case "home":
      return <SetupView onStatusResolved={handlers.onStatusResolved} />;
    case "workbench":
      return (
        <SelectView
          onTicketsSelected={handlers.onTicketsSelected}
          saveState={handlers.saveState}
        />
      );
    case "themes":
    case "generate":
      // v1 had no separate themes screen — grouping and generation
      // both lived in GenerateView. Both legacy routes resolve there.
      return (
        <GenerateView
          tickets={handlers.tickets}
          onGenerated={handlers.onGenerated}
          onBack={handlers.onBackFromGenerate}
          saveState={handlers.saveState}
          initialInstructions={handlers.initialInstructions}
          initialGroups={handlers.initialGroups}
        />
      );
    case "review":
    case "push":
      return (
        <ReviewView
          testCases={handlers.testCases}
          projectKey={handlers.projectKey}
          onBack={handlers.onBackFromReview}
          onUpdateTestCases={handlers.onUpdateTestCases}
          saveStateImmediate={handlers.saveStateImmediate}
          initialPushResult={handlers.initialPushResult}
        />
      );
    case "cycles":
      return isFeatureEnabled("testCycles") ? (
        <CyclesView />
      ) : (
        <ComingSoon label="Test Cycles" description="Shipping in Phase 10." />
      );
  }
}

function ComingSoon({ label, description }: { label: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <h2 className="t-h1 text-ink">{label}</h2>
      {description && (
        <p className="t-body text-ink-muted mt-2 max-w-md">{description}</p>
      )}
    </div>
  );
}

function V1TitleBar() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri) return;

    const win = getCurrentWindow();
    const refresh = async () => setIsMaximized(await win.isMaximized());

    refresh();

    const unlistenFocusPromise = win.onFocusChanged(() => refresh());
    const unlistenResizedPromise = win.onResized(() => refresh());

    return () => {
      void unlistenFocusPromise.then((unlisten) => unlisten());
      void unlistenResizedPromise.then((unlisten) => unlisten());
    };
  }, [isTauri]);

  const minimize = async () => {
    if (!isTauri) return;
    await getCurrentWindow().minimize();
  };

  const toggleMaximize = async () => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    await win.toggleMaximize();
    setIsMaximized(await win.isMaximized());
  };

  const close = async () => {
    if (!isTauri) return;
    await getCurrentWindow().close();
  };

  return (
    <div className="h-9 shrink-0 border-b border-subtle flex items-center justify-between">
      <div
        data-tauri-drag-region
        className="flex-1 h-full flex items-center px-4 text-[11px] font-medium tracking-wide text-ink-muted select-none"
      >
        Testdeck
      </div>

      <div className="flex items-center h-full">
        <button
          type="button"
          onClick={minimize}
          className="flex justify-center items-center w-12 h-full transition-colors text-ink-muted hover:bg-surface-overlay hover:text-ink"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="2" y1="6" x2="10" y2="6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleMaximize}
          className="flex justify-center items-center w-12 h-full transition-colors text-ink-muted hover:bg-surface-overlay hover:text-ink"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          >
            {isMaximized ? (
              <rect x="2.5" y="2.5" width="7" height="7" rx="0.5" />
            ) : (
              <>
                <path d="M4.5 4.5V3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5H7.5" />
                <rect x="2.5" y="4.5" width="5" height="5" rx="0.5" />
              </>
            )}
          </svg>
        </button>

        <button
          type="button"
          onClick={close}
          className="flex justify-center items-center w-12 h-full transition-colors text-ink-muted hover:bg-err hover:text-white"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          >
            <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
            <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
