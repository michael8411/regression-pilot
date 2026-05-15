/**
 * Phase 05 — board view controls.
 *
 * Right-aligned strip of segmented toggles for column mode + density,
 * plus the explicit refresh button.
 */

import { clsx } from "clsx";
import { Loader2, RefreshCw } from "@/lib/icons";
import type { LiveBoardColumnMode, LiveBoardDensity } from "@/types/live";

export type ColumnModeKey = LiveBoardColumnMode; // "all" | "qa"
export type DensityKey = LiveBoardDensity; // "compact" | "cozy" | "roomy"

interface Props {
  columnMode: ColumnModeKey;
  onColumnModeChange: (next: ColumnModeKey) => void;
  density: DensityKey;
  onDensityChange: (next: DensityKey) => void;
  onRefresh: () => void;
  refreshing: boolean;
  fetchedAt: string | null;
}

const COLUMN_OPTIONS: { value: ColumnModeKey; label: string }[] = [
  { value: "all", label: "All columns" },
  { value: "qa", label: "QA only" },
];

const DENSITY_OPTIONS: { value: DensityKey; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "cozy", label: "Cozy" },
  { value: "roomy", label: "Roomy" },
];

export function BoardViewControls({
  columnMode,
  onColumnModeChange,
  density,
  onDensityChange,
  onRefresh,
  refreshing,
  fetchedAt,
}: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <SegmentedToggle
        ariaLabel="Column mode"
        value={columnMode}
        options={COLUMN_OPTIONS}
        onChange={onColumnModeChange}
      />
      <SegmentedToggle
        ariaLabel="Card density"
        value={density}
        options={DENSITY_OPTIONS}
        onChange={onDensityChange}
      />

      <span className="text-[10.5px] text-ink-faint font-mono">
        {fetchedAt ? `Updated ${formatTime(fetchedAt)}` : "—"}
      </span>

      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh board"
        title="Refresh board"
        disabled={refreshing}
        className="g-btn text-[12px] px-2 py-1 flex items-center gap-1.5 disabled:opacity-50"
      >
        {refreshing ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <RefreshCw size={11} />
        )}
        Refresh
      </button>
    </div>
  );
}

interface ToggleProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}

function SegmentedToggle<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: ToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-md border border-subtle bg-surface-elevated p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              "text-[10.5px] font-medium px-2 py-1 rounded transition-colors",
              active
                ? "bg-accent-dim text-accent-text"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
