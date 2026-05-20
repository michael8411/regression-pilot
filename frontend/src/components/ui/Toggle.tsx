import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  label?: ReactNode;
  labelPosition?: "before" | "after";
  "aria-label"?: string;
  className?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  function Toggle(
    { checked, onChange, size = "md", disabled, label, labelPosition = "before",
      "aria-label": ariaLabel, className },
    ref,
  ) {
    const dims = size === "sm"
      ? { track: "h-3.5 w-6", thumb: "h-2.5 w-2.5", translate: "translate-x-2.5" }
      : { track: "h-4   w-7", thumb: "h-3   w-3",   translate: "translate-x-3"   };

    const switchEl = (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex items-center shrink-0 rounded-full",
          "transition-colors duration-fast ease-smooth",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          dims.track,
          checked ? "bg-accent" : "bg-surface-overlay border border-muted",
        )}
      >
        <span
          className={cn(
            "inline-block rounded-full bg-white shadow-sm",
            "transform transition-transform duration-fast ease-smooth",
            dims.thumb,
            "ml-0.5",
            checked && dims.translate,
          )}
        />
      </button>
    );

    if (!label) return switchEl;
    return (
      <span className={cn("inline-flex items-center gap-3", className)}>
        {labelPosition === "before" && <span className="t-body text-ink">{label}</span>}
        {switchEl}
        {labelPosition === "after" && <span className="t-body text-ink">{label}</span>}
      </span>
    );
  },
);
Toggle.displayName = "Toggle";
