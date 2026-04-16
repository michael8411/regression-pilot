import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SetupView } from "@/components/SetupView";
import { SelectView } from "@/components/SelectView";
import { GenerateView } from "@/components/GenerateView";
import { ReviewView } from "@/components/ReviewView";
import { ChatView } from "@/components/ChatView";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppView, ConfigStatus, JiraTicket, TestCase } from "@/types";

export default function App() {
  const [view, setView] = useState<AppView>("setup");
  const [jiraReady, setJiraReady] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<JiraTicket[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [projectKey, setProjectKey] = useState("FM");
  const [hasAutoRedirected, setHasAutoRedirected] = useState<boolean>(false);
  const [manualSetupOpen, setManualSetupOpen] = useState<boolean>(false);

  const handleStatusResolved = (status: ConfigStatus) => {
    setJiraReady(status.jira.configured);

    // First successful config check can move setup -> select, unless user explicitly opened Config.
    if (status.jira.configured && !hasAutoRedirected && !manualSetupOpen) {
      setView("select");
      setHasAutoRedirected(true);
    }
  };

  const handleNavigate = (nextView: AppView) => {
    setManualSetupOpen(nextView === "setup");
    setView(nextView);
  };

  const handleTicketsSelected = (tickets: JiraTicket[]) => {
    setSelectedTickets(tickets);
    if (tickets.length > 0) {
      setProjectKey(tickets[0].key.split("-")[0]);
    }
    setView("generate");
  };

  const handleGenerated = (cases: TestCase[]) => {
    setTestCases(cases);
    setView("review");
  };

  return (
    <div className="flex h-full">
      <div className="bg-scene" />

      <Sidebar
        currentView={view}
        onNavigate={handleNavigate}
        jiraReady={jiraReady}
        hasTickets={selectedTickets.length > 0}
        hasTestCases={testCases.length > 0}
      />

      <main className="flex overflow-hidden flex-col flex-1">
        <TitleBar />

        {view === "setup" && (
          <SetupView onStatusResolved={handleStatusResolved} />
        )}
        {view === "select" && (
          <SelectView onTicketsSelected={handleTicketsSelected} />
        )}
        {view === "generate" && (
          <GenerateView
            tickets={selectedTickets}
            onGenerated={handleGenerated}
            onBack={() => setView("select")}
          />
        )}
        {view === "review" && (
          <ReviewView
            testCases={testCases}
            projectKey={projectKey}
            onBack={() => setView("generate")}
            onUpdateTestCases={setTestCases}
          />
        )}
        {view === "chat" && <ChatView tickets={selectedTickets} />}
      </main>
    </div>
  );
}

function TitleBar() {
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
