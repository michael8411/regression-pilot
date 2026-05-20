import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  tone?: "accent" | "ai" | "ink";
}

const SPIN_TONE: Record<NonNullable<SpinnerProps["tone"]>, string> = {
  accent: "border-t-accent",
  ai:     "border-t-ai",
  ink:    "border-t-ink",
};

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(
  function Spinner(
    { size = 14, tone = "accent", "aria-label": ariaLabel = "Loading",
      className, ...rest },
    ref,
  ) {
    return (
      <span
        ref={ref}
        role="status"
        aria-label={ariaLabel}
        className={cn(
          "inline-block rounded-full",
          "border-[2px] border-white/10",
          "animate-spin-fast",
          SPIN_TONE[tone],
          className,
        )}
        style={{ width: size, height: size }}
        {...rest}
      />
    );
  },
);
Spinner.displayName = "Spinner";
