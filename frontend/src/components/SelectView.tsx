import { useState, useEffect, useMemo, useRef } from "react";
import { clsx } from "clsx";
import {
  FolderSearch,
  ChevronDown,
  Check,
  Loader2,
  AlertCircle,
  ArrowRight,
  Search,
} from "lucide-react";
import { getProjects, getVersions, getTickets } from "@/lib/api";
import { useAsync, useSelection } from "@/hooks/useAsync";
import type { JiraProject, JiraVersion, JiraTicket } from "@/types";

interface SelectViewProps {
  onTicketsSelected: (tickets: JiraTicket[]) => void;
}

export function SelectView({ onTicketsSelected }: SelectViewProps) {
  const projects = useAsync<JiraProject[]>();
  const versions = useAsync<JiraVersion[]>();
  const tickets = useAsync<JiraTicket[]>();

  const [selectedProject, setSelectedProject] = useState<JiraProject | null>(
    null,
  );
  const [selectedVersion, setSelectedVersion] = useState<JiraVersion | null>(
    null,
  );
  const selection = useSelection<JiraTicket>();

  useEffect(() => {
    projects.execute(() => getProjects());
  }, []);

  const handleProjectSelect = async (project: JiraProject) => {
    setSelectedProject(project);
    setSelectedVersion(null);
    tickets.reset();
    selection.deselectAll();
    await versions.execute(() => getVersions(project.key));
  };

  const handleVersionSelect = async (version: JiraVersion) => {
    setSelectedVersion(version);
    selection.deselectAll();
    const result = await tickets.execute(() => getTickets(version.name));
    if (result) selection.selectAll(result);
  };

  const handleProceed = () => {
    if (!tickets.data) return;
    const selected = tickets.data.filter((t) => selection.isSelected(t.key));
    onTicketsSelected(selected);
  };

  return (
    <div className="flex overflow-hidden flex-col flex-1 gap-5 p-6 animate-fade">
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <div className="flex justify-center items-center w-9 h-9 rounded-lg bg-accent-dim">
            <FolderSearch size={18} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Select Tickets</h2>
            <p className="text-xs text-ink-muted">
              Choose a release and pick tickets for regression
            </p>
          </div>
        </div>
        {selection.count > 0 && (
          <button
            onClick={handleProceed}
            className="flex gap-2 items-center px-5 g-btn-solid"
          >
            Generate ({selection.count})
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      <div className="flex gap-3">
        <Dropdown
          label="Project"
          loading={projects.loading}
          error={projects.error}
          placeholder="Select project..."
          value={selectedProject?.name}
          items={projects.data || []}
          renderItem={(p) => (
            <span className="flex gap-2 items-center">
              {p.avatar_url && (
                <img src={p.avatar_url} className="w-4 h-4 rounded" alt="" />
              )}
              <span className="font-medium">{p.key}</span>
              <span className="text-ink-muted">{p.name}</span>
            </span>
          )}
          onSelect={handleProjectSelect}
          getSearchText={(p) => `${p.key} ${p.name}`}
        />

        <Dropdown
          label="Release Version"
          loading={versions.loading}
          error={versions.error}
          placeholder={
            selectedProject ? "Select version..." : "Pick a project first"
          }
          disabled={!selectedProject}
          value={selectedVersion?.name}
          items={versions.data || []}
          renderItem={(v) => (
            <span className="flex gap-2 items-center">
              <span className="font-medium">{v.name}</span>
              {v.overdue && (
                <span className="text-[10px] text-err bg-err/10 px-1.5 py-0.5 rounded-md border border-err/20">
                  overdue
                </span>
              )}
              {v.release_date && (
                <span className="text-ink-muted text-[11px] ml-auto">
                  {v.release_date}
                </span>
              )}
            </span>
          )}
          onSelect={handleVersionSelect}
          getSearchText={(v) =>
            [v.name, v.release_date, v.description].filter(Boolean).join(" ")
          }
        />
      </div>

      <div className="flex overflow-hidden flex-col flex-1 surface">
        <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <div className="flex gap-3 items-center">
            <span className="text-xs font-medium text-ink-muted">
              {tickets.data
                ? `${tickets.data.length} tickets`
                : selectedVersion
                  ? "Loading..."
                  : "Select a release version above"}
            </span>
          </div>
          {tickets.data && tickets.data.length > 0 && (
            <div className="flex gap-2 items-center">
              <button
                onClick={() => selection.selectAll(tickets.data!)}
                className="text-[11px] text-accent-text hover:text-accent transition-colors"
              >
                Select all
              </button>
              <span className="text-ink-faint">|</span>
              <button
                onClick={selection.deselectAll}
                className="text-[11px] text-ink-muted hover:text-ink-secondary transition-colors"
              >
                Deselect all
              </button>
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {tickets.loading && (
            <div className="flex justify-center items-center py-16">
              <Loader2 size={20} className="animate-spin text-accent" />
              <span className="ml-3 text-sm text-ink-muted">
                Fetching tickets...
              </span>
            </div>
          )}

          {tickets.error && (
            <div className="flex justify-center items-center py-16">
              <AlertCircle size={16} className="text-err" />
              <span className="ml-2 text-sm text-err/80">{tickets.error}</span>
            </div>
          )}

          {tickets.data?.map((ticket, i) => (
            <TicketRow
              key={ticket.key}
              ticket={ticket}
              selected={selection.isSelected(ticket.key)}
              onToggle={() => selection.toggle(ticket.key)}
              index={i}
            />
          ))}

          {tickets.data?.length === 0 && (
            <div className="flex justify-center items-center py-16">
              <span className="text-sm text-ink-muted">
                No tickets found for this version
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Substring match preferred; otherwise subsequence (fuzzy) match with gap penalty. */
function rankToken(haystack: string, token: string): number {
  const h = haystack.toLowerCase();
  const t = token.toLowerCase();
  if (!t) return Number.MAX_SAFE_INTEGER;
  if (h.includes(t)) {
    const idx = h.indexOf(t);
    return 4000 - idx + (idx === 0 ? 200 : 0);
  }
  let ti = 0;
  let firstIdx = -1;
  let prevHi = -1;
  let gapPenalty = 0;
  for (let hi = 0; hi < h.length && ti < t.length; hi++) {
    if (h[hi] === t[ti]) {
      if (firstIdx < 0) firstIdx = hi;
      if (prevHi >= 0) gapPenalty += hi - prevHi - 1;
      prevHi = hi;
      ti++;
    }
  }
  if (ti < t.length) return 0;
  return 2000 - firstIdx - gapPenalty;
}

/** AND across whitespace-separated tokens; higher score = better match. */
function filterRank(haystack: string, query: string): number {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return Number.MAX_SAFE_INTEGER;
  let sum = 0;
  for (const tok of tokens) {
    const r = rankToken(haystack, tok);
    if (r === 0) return 0;
    sum += r;
  }
  return sum;
}

function Dropdown<T>({
  label,
  loading,
  error,
  placeholder,
  disabled,
  value,
  items,
  renderItem,
  onSelect,
  getSearchText,
}: {
  label: string;
  loading: boolean;
  error: string | null;
  placeholder: string;
  disabled?: boolean;
  value?: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  getSearchText: (item: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    const q = filterQuery.trim();
    if (!q) return items;
    const scored = items
      .map((item) => {
        const hay = getSearchText(item);
        const rank = filterRank(hay, q);
        return rank > 0 ? { item, rank } : null;
      })
      .filter((x): x is { item: T; rank: number } => x !== null);
    scored.sort((a, b) => b.rank - a.rank);
    return scored.map((x) => x.item);
  }, [items, filterQuery, getSearchText]);

  useEffect(() => {
    if (open) {
      setFilterQuery("");
      const id = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const close = () => {
    setOpen(false);
    setFilterQuery("");
  };

  return (
    <div className="relative flex-1">
      <label className="text-[11px] text-ink-muted font-medium mb-1.5 block">
        {label}
      </label>
      <button
        type="button"
        onClick={() => !disabled && items.length > 0 && setOpen(!open)}
        disabled={disabled}
        className={clsx(
          "w-full g-input flex items-center justify-between text-left",
          disabled && "opacity-40 cursor-not-allowed",
        )}
      >
        <span
          className={clsx("truncate", value ? "text-ink" : "text-ink-muted")}
        >
          {value || placeholder}
        </span>
        {loading ? (
          <Loader2 size={14} className="animate-spin text-accent shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-ink-muted shrink-0" />
        )}
      </button>

      {error && (
        <p className="text-[11px] text-err/90 mt-1 flex items-center gap-1">
          <AlertCircle size={12} className="shrink-0" />
          {error}
        </p>
      )}

      {open && items.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden onClick={close} />
          <div
            className="flex absolute top-full z-30 flex-col p-1 mt-1 w-full max-h-72 glass animate-fade"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex items-center gap-2 px-2 py-1.5 mb-0.5 border-b border-subtle">
              <Search size={14} className="text-ink-muted shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter..."
                className="py-1 w-full text-sm bg-transparent outline-none text-ink placeholder:text-ink-muted"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="overflow-y-auto max-h-56 p-0.5">
              {filteredItems.length === 0 ? (
                <div className="px-3 py-6 text-sm text-center text-ink-muted">
                  No matches
                </div>
              ) : (
                filteredItems.map((item: any, i: number) => (
                  <button
                    type="button"
                    key={item.id || item.key || i}
                    onClick={() => {
                      onSelect(item);
                      close();
                    }}
                    className="px-3 py-2 w-full text-sm text-left rounded-lg transition-colors hover:bg-surface-overlay"
                  >
                    {renderItem(item)}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TicketRow({
  ticket,
  selected,
  onToggle,
  index,
}: {
  ticket: JiraTicket;
  selected: boolean;
  onToggle: () => void;
  index: number;
}) {
  const priorityColor: Record<string, string> = {
    Highest: "text-err",
    High: "text-warn",
    Medium: "text-accent-text",
    Low: "text-ink-muted",
    Lowest: "text-ink-faint",
  };

  return (
    <div
      onClick={onToggle}
      style={{ animationDelay: `${index * 30}ms` }}
      className={clsx(
        "flex items-center gap-3 px-4 py-3 border-b border-subtle cursor-pointer transition-all duration-100 animate-in border-l-2",
        selected
          ? "bg-[rgba(15,184,163,0.07)] border-l-accent"
          : "hover:bg-surface-overlay border-l-transparent",
      )}
    >
      <div
        className={clsx(
          "flex justify-center items-center w-4 h-4 rounded border transition-all shrink-0",
          selected
            ? "bg-accent border-accent"
            : "border-muted hover:border-ink-faint",
        )}
      >
        {selected && (
          <Check size={10} strokeWidth={2.5} className="text-white" />
        )}
      </div>

      <span className="text-xs font-mono tabular-nums text-ink-muted w-[72px] shrink-0">
        {ticket.key}
      </span>

      <span className="flex-1 text-sm truncate text-ink-secondary">
        {ticket.summary}
      </span>

      <span
        className={clsx(
          "text-[10px] font-medium px-2 py-0.5 rounded-md shrink-0 border",
          ticket.status === "Closed" || ticket.status === "Done"
            ? "bg-ok/10 text-ok border-ok/20"
            : ticket.status === "Open"
              ? "bg-warn/10 text-warn border-warn/20"
              : "bg-surface-overlay text-ink-muted border-subtle",
        )}
      >
        {ticket.status}
      </span>

      <span
        className={clsx(
          "text-[11px] shrink-0 w-12 text-right tabular-nums",
          priorityColor[ticket.priority] || "text-ink-muted",
        )}
      >
        {ticket.priority}
      </span>

      <span className="text-[11px] text-ink-muted w-20 truncate text-right shrink-0">
        {ticket.assignee}
      </span>
    </div>
  );
}
