import { useMemo } from "react";
import type { JiraTicket } from "@/types";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ChevronDown } from "@/lib/icons";

export interface Filters {
  query: string;
  statuses: Set<string>;
  priorities: Set<string>;
  assignee: string | null; // exact match against ticket.assignee
  labels: Set<string>;
}

export const EMPTY_FILTERS: Filters = {
  query: "",
  statuses: new Set(),
  priorities: new Set(),
  assignee: null,
  labels: new Set(),
};

export interface TicketFiltersProps {
  tickets: JiraTicket[];
  filters: Filters;
  onChange: (filters: Filters) => void;
}

/**
 * Filter chips bar — status, priority, label toggles and an assignee
 * dropdown. All option sets are derived from the loaded ticket list so
 * the controls only ever offer values that can produce a match.
 */
export function TicketFilters({
  tickets,
  filters,
  onChange,
}: TicketFiltersProps) {
  const statusOptions = useMemo(
    () => uniqueNonEmpty(tickets.map((t) => t.status)),
    [tickets],
  );
  const priorityOptions = useMemo(
    () => uniqueNonEmpty(tickets.map((t) => t.priority)),
    [tickets],
  );
  const assigneeOptions = useMemo(
    () => uniqueNonEmpty(tickets.map((t) => t.assignee)),
    [tickets],
  );
  const labelOptions = useMemo(
    () => uniqueNonEmpty(tickets.flatMap((t) => t.labels ?? [])),
    [tickets],
  );

  const toggleSet = (key: "statuses" | "priorities" | "labels", v: string) => {
    const next = new Set(filters[key]);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange({ ...filters, [key]: next });
  };

  const setAssignee = (v: string) => {
    onChange({ ...filters, assignee: v === "" ? null : v });
  };

  const hasAny =
    filters.statuses.size > 0 ||
    filters.priorities.size > 0 ||
    filters.labels.size > 0 ||
    filters.assignee !== null ||
    filters.query.trim() !== "";

  if (
    statusOptions.length === 0 &&
    priorityOptions.length === 0 &&
    assigneeOptions.length === 0 &&
    labelOptions.length === 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b border-subtle">
      {statusOptions.length > 0 && (
        <FilterRow label="Status">
          {statusOptions.map((v) => (
            <Chip
              key={v}
              active={filters.statuses.has(v)}
              onClick={() => toggleSet("statuses", v)}
            >
              {v}
            </Chip>
          ))}
        </FilterRow>
      )}

      {priorityOptions.length > 0 && (
        <FilterRow label="Priority">
          {priorityOptions.map((v) => (
            <Chip
              key={v}
              active={filters.priorities.has(v)}
              onClick={() => toggleSet("priorities", v)}
            >
              {v}
            </Chip>
          ))}
        </FilterRow>
      )}

      {assigneeOptions.length > 0 && (
        <FilterRow label="Assignee">
          <AssigneeSelect
            value={filters.assignee ?? ""}
            options={assigneeOptions}
            onChange={setAssignee}
          />
        </FilterRow>
      )}

      {labelOptions.length > 0 && (
        <FilterRow label="Label">
          {labelOptions.map((v) => (
            <Chip
              key={v}
              active={filters.labels.has(v)}
              onClick={() => toggleSet("labels", v)}
            >
              {v}
            </Chip>
          ))}
        </FilterRow>
      )}

      {hasAny && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...EMPTY_FILTERS, query: filters.query })}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="t-label w-[64px] shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium",
        "border transition-colors duration-fast ease-smooth",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        active
          ? "bg-accent/10 text-accent-text border-accent/30"
          : "bg-surface-overlay text-ink-muted border-subtle hover:bg-surface-elevated hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function AssigneeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "appearance-none h-7 pl-2.5 pr-7 rounded-full text-[11px] font-medium",
          "bg-surface-overlay text-ink-secondary border border-subtle",
          "hover:bg-surface-elevated hover:text-ink hover:border-strong",
          "focus:outline-none focus:ring-2 focus:ring-accent/40",
        )}
        aria-label="Filter by assignee"
      >
        <option value="">Anyone</option>
        {options.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted">
        <ChevronDown size={12} />
      </span>
    </div>
  );
}

function uniqueNonEmpty(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    if (v && typeof v === "string" && v.trim() !== "") seen.add(v);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}
