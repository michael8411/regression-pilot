import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<V extends string = string> {
  value: V;
  onChange: (next: V) => void;
  options: SegmentedOption<V>[];
  size?: "sm" | "md";
  "aria-label": string;
  className?: string;
}

export function Segmented<V extends string = string>({
  value,
  onChange,
  options,
  size = "md",
  "aria-label": ariaLabel,
  className,
}: SegmentedProps<V>) {
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      for (let i = 1; i <= options.length; i++) {
        const next = options[(idx + i) % options.length];
        if (!next.disabled) { onChange(next.value); break; }
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      for (let i = 1; i <= options.length; i++) {
        const next = options[(idx - i + options.length) % options.length];
        if (!next.disabled) { onChange(next.value); break; }
      }
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className={cn(
        "inline-flex p-0.5 rounded-lg border border-subtle bg-surface-sunken",
        className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={selected}
            disabled={o.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5",
              "font-medium rounded-md transition-colors duration-fast",
              size === "sm"
                ? "h-6 px-2 text-[11px]"
                : "h-7 px-2.5 text-[12px]",
              selected
                ? "bg-surface-elevated text-ink shadow-sm"
                : "text-ink-secondary hover:text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
Segmented.displayName = "Segmented";
