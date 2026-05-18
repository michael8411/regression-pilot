import { clsx } from "clsx";
import { ChevronDown, ChevronRight } from "@/lib/icons";

interface Props {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  /** Cycled tone hex from the Phase 04 lane palette. */
  accent: string;
}

export function BoardLaneHeader({
  label,
  count,
  collapsed,
  onToggle,
  accent,
}: Props) {
  return (
    <header
      className={clsx(
        "flex items-center gap-2 px-3 py-1.5 rounded-md border border-subtle bg-surface-overlay/40",
      )}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="text-ink-muted hover:text-ink"
      >
        {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
      </button>
      <h3 className="text-[11.5px] font-semibold text-ink truncate" title={label}>
        {label}
      </h3>
      <span className="text-[10.5px] text-ink-faint font-mono">({count})</span>
    </header>
  );
}
