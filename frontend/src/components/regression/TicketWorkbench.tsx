import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ClipboardList,
  Filter,
  Key,
  Loader2,
  Search,
  X,
} from "@/lib/icons";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAsync } from "@/hooks/useAsync";
import { getConfigStatus, getTickets } from "@/lib/api";
import type {
  ConfigStatus,
  JiraProject,
  JiraTicket,
  JiraVersion,
} from "@/types";
import { useRegressionSession } from "./hooks/useRegressionSession";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { requestOpenBuilder } from "@/components/cycles";
import { ProjectVersionPanel } from "./parts/ProjectVersionPanel";
import { TicketRow } from "./parts/TicketRow";
import {
  TicketFilters,
  EMPTY_FILTERS,
  type Filters,
} from "./parts/TicketFilters";
import { EmptyState } from "./parts/EmptyState";

export function TicketWorkbench() {
  const { state, isRestoring, saveStateBatch } = useRegressionSession();

  if (isRestoring) return <WorkbenchSkeleton />;

  // Inner-component pattern so useState initializers see the hydrated session.
  return (
    <TicketWorkbenchInner
      initialProject={state.selectedProject}
      initialVersion={state.selectedVersion}
      initialSelectedKeys={state.selectedTickets.map((t) => t.key)}
      saveStateBatch={saveStateBatch}
    />
  );
}

interface InnerProps {
  initialProject: JiraProject | undefined;
  initialVersion: JiraVersion | undefined;
  initialSelectedKeys: string[];
  saveStateBatch: (items: Record<string, unknown>) => Promise<void>;
}

function TicketWorkbenchInner({
  initialProject,
  initialVersion,
  initialSelectedKeys,
  saveStateBatch,
}: InnerProps) {
  const { goto } = useRoute();

  // Selection: Set of ticket keys, hydrated once from the session.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(initialSelectedKeys),
  );
  const [selectedProject, setSelectedProject] = useState<JiraProject | undefined>(
    initialProject,
  );
  const [selectedVersion, setSelectedVersion] = useState<JiraVersion | undefined>(
    initialVersion,
  );
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const tickets = useAsync<JiraTicket[]>();
  const config = useAsync<ConfigStatus>();

  // One-shot config status fetch on mount.
  useEffect(() => {
    config.execute(() => getConfigStatus()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load tickets whenever the version changes.
  const versionName = selectedVersion?.name;
  useEffect(() => {
    if (!versionName) {
      tickets.reset();
      return;
    }
    tickets.execute(() => getTickets(versionName)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionName]);

  // Drop selection entries that are no longer in the visible ticket set.
  // Entries that ARE still visible (e.g. user toggled versions and back)
  // are preserved.
  const ticketsData = tickets.data;
  useEffect(() => {
    if (!ticketsData) return;
    const visible = new Set(ticketsData.map((t) => t.key));
    setSelectedKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (visible.has(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [ticketsData]);

  // Filter the loaded tickets through the filter set.
  const displayed = useMemo(
    () => applyFilters(tickets.data ?? [], filters),
    [tickets.data, filters],
  );

  const toggle = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllDisplayed = useCallback(() => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const t of displayed) next.add(t.key);
      return next;
    });
  }, [displayed]);

  const clearAll = useCallback(() => setSelectedKeys(new Set()), []);

  const onContinue = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    const all = tickets.data ?? [];
    const picked = all.filter((t) => selectedKeys.has(t.key));
    if (picked.length === 0) return;

    // Save project + version + tickets in one round-trip and clear all
    // downstream state — picking a new ticket set invalidates themes,
    // generated test cases, and any prior push result.
    await saveStateBatch({
      selectedProject,
      selectedVersion,
      selectedTickets: picked,
      currentRoute: ["regression", "themes"],
      editableGroups: null,
      testCases: [],
      pushResult: null,
    });
    goto(["regression", "themes"]);
  }, [
    selectedKeys,
    tickets.data,
    saveStateBatch,
    selectedProject,
    selectedVersion,
    goto,
  ]);

  // Command palette: Continue + Clear selection.
  const continueCmd = useMemo<CommandItem | false>(
    () =>
      selectedKeys.size === 0
        ? false
        : {
            id: "workbench.continue",
            group: "action",
            label: "Continue to themes",
            sub: "workbench",
            icon: ArrowRight,
            kbd: "Mod+Enter",
            action: { type: "run", run: onContinue },
          },
    [selectedKeys.size, onContinue],
  );
  useRegisterCommand(continueCmd);

  const clearCmd = useMemo<CommandItem | false>(
    () =>
      selectedKeys.size === 0
        ? false
        : {
            id: "workbench.clear-selection",
            group: "action",
            label: "Clear selected tickets",
            sub: "workbench",
            icon: X,
            action: { type: "run", run: clearAll },
          },
    [selectedKeys.size, clearAll],
  );
  useRegisterCommand(clearCmd);

  // Jira-not-configured guard. We only know once config has actually loaded;
  // while it's loading, render nothing under the header instead of bouncing
  // the user to an empty state that would flash off.
  const jiraConfigured = config.data?.jira.configured ?? null;

  if (jiraConfigured === false) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        <Header
          query=""
          onQuery={() => {}}
          selectedCount={0}
          canContinue={false}
          onContinue={() => {}}
          disabled
        />
        <EmptyState
          icon={Key}
          title="Connect Jira"
          description="Add a Jira API token in Settings to browse projects and tickets."
          action={{
            label: "Open setup",
            onClick: () => goto(["regression", "home"]),
          }}
          tone="warn"
        />
      </div>
    );
  }

  const ticketCount = tickets.data?.length ?? 0;
  const showFilters = ticketCount > 0;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <Header
        query={filters.query}
        onQuery={(q) => setFilters({ ...filters, query: q })}
        selectedCount={selectedKeys.size}
        canContinue={selectedKeys.size > 0}
        onContinue={onContinue}
        onSaveAsCycle={
          isFeatureEnabled("testCycles")
            ? () => {
                requestOpenBuilder({
                  name:
                    selectedProject && selectedVersion
                      ? `${selectedProject.key} ${selectedVersion.name} cycle`
                      : selectedProject
                        ? `${selectedProject.key} cycle`
                        : "",
                  projectKey: selectedProject?.key ?? "",
                  versionHint: selectedVersion?.name ?? "",
                  ticketKeys: Array.from(selectedKeys),
                });
                goto(["regression", "cycles"]);
              }
            : undefined
        }
      />

      <div className="flex overflow-hidden flex-1 min-h-0">
        <ProjectVersionPanel
          selectedProject={selectedProject}
          selectedVersion={selectedVersion}
          onProjectChange={(p) => {
            setSelectedProject(p);
            setSelectedVersion(undefined);
          }}
          onVersionChange={setSelectedVersion}
          selectedCount={selectedKeys.size}
          totalCount={ticketCount}
          onClearAll={clearAll}
        />

        <section className="flex flex-col flex-1 min-w-0 min-h-0">
          {showFilters && (
            <TicketFilters
              tickets={tickets.data ?? []}
              filters={filters}
              onChange={setFilters}
            />
          )}

          {tickets.data && tickets.data.length > 0 && (
            <ListToolbar
              displayedCount={displayed.length}
              totalCount={ticketCount}
              selectedCount={selectedKeys.size}
              onSelectAllDisplayed={selectAllDisplayed}
              onClearAll={clearAll}
            />
          )}

          <div className="overflow-y-auto flex-1 min-h-0">
            <TicketListBody
              loading={tickets.loading}
              error={tickets.error}
              hasVersion={!!selectedVersion}
              total={ticketCount}
              displayed={displayed}
              selectedKeys={selectedKeys}
              jiraBaseUrl={config.data?.jira.base_url ?? null}
              onToggle={toggle}
              hasFilters={hasActiveFilters(filters)}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

interface HeaderProps {
  query: string;
  onQuery: (s: string) => void;
  selectedCount: number;
  canContinue: boolean;
  onContinue: () => void;
  onSaveAsCycle?: () => void;
  disabled?: boolean;
}

function Header({
  query,
  onQuery,
  selectedCount,
  canContinue,
  onContinue,
  onSaveAsCycle,
  disabled,
}: HeaderProps) {
  return (
    <div className="flex gap-4 items-center px-6 py-4 border-b border-subtle">
      <div className="flex-1 min-w-0">
        <h1 className="t-h2 text-ink">Pick tickets</h1>
        <p className="t-meta text-ink-muted">
          Choose tickets from a Jira fix version to test.
        </p>
      </div>
      <SearchInput value={query} onChange={onQuery} disabled={disabled} />
      {onSaveAsCycle && (
        <Button
          variant="ghost"
          size="md"
          disabled={selectedCount === 0}
          onClick={onSaveAsCycle}
        >
          Save as cycle…
        </Button>
      )}
      <Button
        variant="primary"
        size="md"
        disabled={!canContinue}
        onClick={onContinue}
        trailing={<ArrowRight size={14} />}
      >
        Continue{selectedCount > 0 ? ` (${selectedCount})` : ""}
      </Button>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 h-9 w-[280px] px-3 rounded-lg",
        "bg-surface-input border border-muted",
        "focus-within:border-strong focus-within:ring-2 focus-within:ring-accent/40",
        disabled && "opacity-50",
      )}
    >
      <Search size={14} className="text-ink-muted shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by key or summary…"
        disabled={disabled}
        className="flex-1 bg-transparent outline-none text-[13px] text-ink placeholder:text-ink-muted"
      />
    </label>
  );
}

interface ListToolbarProps {
  displayedCount: number;
  totalCount: number;
  selectedCount: number;
  onSelectAllDisplayed: () => void;
  onClearAll: () => void;
}

function ListToolbar({
  displayedCount,
  totalCount,
  selectedCount,
  onSelectAllDisplayed,
  onClearAll,
}: ListToolbarProps) {
  return (
    <div className="flex justify-between items-center px-4 py-2 border-b border-subtle bg-surface-panel/40">
      <span className="t-meta text-ink-muted tnum">
        {displayedCount === totalCount
          ? `${totalCount} tickets`
          : `${displayedCount} of ${totalCount} shown`}
        {selectedCount > 0 && (
          <span className="ml-2 text-ink-secondary">· {selectedCount} selected</span>
        )}
      </span>
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={onSelectAllDisplayed}
          className="text-[11px] text-accent-text hover:text-accent transition-colors"
        >
          Select All
        </button>
        <span className="text-ink-faint">|</span>
        <button
          type="button"
          onClick={onClearAll}
          className="text-[11px] text-ink-muted hover:text-ink-secondary transition-colors"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

interface ListBodyProps {
  loading: boolean;
  error: string | null;
  hasVersion: boolean;
  total: number;
  displayed: JiraTicket[];
  selectedKeys: Set<string>;
  jiraBaseUrl: string | null;
  onToggle: (key: string) => void;
  hasFilters: boolean;
  onClearFilters: () => void;
}

function TicketListBody({
  loading,
  error,
  hasVersion,
  total,
  displayed,
  selectedKeys,
  jiraBaseUrl,
  onToggle,
  hasFilters,
  onClearFilters,
}: ListBodyProps) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 size={20} className="animate-spin-fast text-accent" />
        <span className="ml-3 text-[13px] text-ink-muted">Fetching tickets…</span>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Couldn't load tickets"
        description={error}
        tone="warn"
      />
    );
  }

  if (!hasVersion) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Pick a fix version"
        description="Select a project and version on the left to load tickets."
      />
    );
  }

  if (total === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No tickets in this version"
        description="There are no Jira issues attached to the selected fix version."
      />
    );
  }

  if (displayed.length === 0) {
    return (
      <EmptyState
        icon={Filter}
        title="No tickets match these filters"
        description="Try removing a chip or clearing the search query."
        action={
          hasFilters
            ? { label: "Clear filters", onClick: onClearFilters }
            : undefined
        }
      />
    );
  }

  return (
    <div role="rowgroup">
      {displayed.map((ticket) => (
        <TicketRow
          key={ticket.key}
          ticket={ticket}
          selected={selectedKeys.has(ticket.key)}
          onToggle={() => onToggle(ticket.key)}
          jiraBaseUrl={jiraBaseUrl}
        />
      ))}
    </div>
  );
}

function WorkbenchSkeleton() {
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex gap-4 items-center px-6 py-4 border-b border-subtle">
        <div className="flex-1 space-y-2">
          <div className="w-40 h-5 rounded animate-pulse bg-surface-overlay" />
          <div className="w-72 h-3 rounded animate-pulse bg-surface-overlay" />
        </div>
        <div className="h-9 w-[280px] rounded-lg bg-surface-overlay animate-pulse" />
        <div className="w-32 h-9 rounded-lg animate-pulse bg-surface-overlay" />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-[280px] shrink-0 px-4 py-5 border-r border-subtle space-y-4">
          <div className="w-16 h-3 rounded animate-pulse bg-surface-overlay" />
          <div className="h-9 rounded-lg animate-pulse bg-surface-overlay" />
          <div className="mt-4 w-16 h-3 rounded animate-pulse bg-surface-overlay" />
          <div className="h-9 rounded-lg animate-pulse bg-surface-overlay" />
        </div>
        <div className="flex-1 p-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded animate-pulse bg-surface-overlay"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function applyFilters(tickets: JiraTicket[], f: Filters): JiraTicket[] {
  const q = f.query.toLowerCase().trim();
  return tickets.filter((t) => {
    if (f.statuses.size > 0 && !f.statuses.has(t.status)) return false;
    if (f.priorities.size > 0 && !f.priorities.has(t.priority)) return false;
    if (f.assignee !== null && t.assignee !== f.assignee) return false;
    if (f.labels.size > 0) {
      const labels = t.labels ?? [];
      if (!labels.some((l) => f.labels.has(l))) return false;
    }
    if (!q) return true;
    return (
      t.key.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q)
    );
  });
}

function hasActiveFilters(f: Filters): boolean {
  return (
    f.query.trim() !== "" ||
    f.statuses.size > 0 ||
    f.priorities.size > 0 ||
    f.labels.size > 0 ||
    f.assignee !== null
  );
}
