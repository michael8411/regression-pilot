import { Search } from "@/lib/icons";
import type { HistoryFilter } from "./historyUtils";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  filter: HistoryFilter;
  onFilterChange: (f: HistoryFilter) => void;
}

const FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: "all",       label: "All"       },
  { id: "draft",     label: "Draft"     },
  { id: "generated", label: "Generated" },
  { id: "pushed",    label: "Pushed"    },
];

export function SessionSearch({ query, onQueryChange, filter, onFilterChange }: Props) {
  return (
    <div className="px-4 py-3 border-b border-subtle flex flex-col gap-3">
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-subtle bg-surface focus-within:border-accent">
        <Search size={14} className="text-ink-muted shrink-0" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search project, version, ticket key…"
          aria-label="Search sessions"
          className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-muted"
        />
      </div>

      <div className="flex items-center gap-1.5" role="tablist" aria-label="Filter sessions">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => onFilterChange(f.id)}
            className={
              filter === f.id
                ? "px-2.5 py-1 rounded-full text-[11px] bg-accent/10 text-accent-text border border-accent/30"
                : "px-2.5 py-1 rounded-full text-[11px] bg-surface-overlay text-ink-muted hover:text-ink border border-transparent"
            }
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
