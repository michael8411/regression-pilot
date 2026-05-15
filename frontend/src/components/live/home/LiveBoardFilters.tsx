import { Search } from "@/lib/icons";
import { clsx } from "clsx";

export type LiveBoardFilterChip = "all" | "pinned";

interface Props {
  query: string;
  onQueryChange: (next: string) => void;
  chip: LiveBoardFilterChip;
  onChipChange: (next: LiveBoardFilterChip) => void;
  total: number;
  visible: number;
}

const CHIPS: { id: LiveBoardFilterChip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pinned", label: "Pinned" },
];

export function LiveBoardFilters({
  query,
  onQueryChange,
  chip,
  onChipChange,
  total,
  visible,
}: Props) {
  return (
    <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
      <div className="flex items-center gap-2">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">Search boards</span>
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
          <input
            type="search"
            value={query}
            placeholder="Search by name or JQL"
            onChange={(e) => onQueryChange(e.target.value)}
            className="g-input text-[12px] pl-7 w-full"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div
          role="tablist"
          aria-label="Board filter"
          className="flex items-center gap-1"
        >
          {CHIPS.map((c) => {
            const active = c.id === chip;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChipChange(c.id)}
                className={clsx(
                  "h-7 px-2.5 rounded-full text-[11.5px] border transition-colors",
                  active
                    ? "bg-accent-dim text-accent-text border-accent/[0.25]"
                    : "bg-surface-elevated text-ink-muted border-subtle hover:text-ink hover:border-muted",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="text-[10.5px] text-ink-faint">
        {visible === total
          ? `${total} board${total === 1 ? "" : "s"}`
          : `${visible} of ${total} board${total === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
