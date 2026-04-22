import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "ai"
  | "ok"
  | "warn"
  | "err"
  | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: "sm" | "md";
  leading?: ReactNode;
  children: ReactNode;
}

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-overlay text-ink-secondary border border-subtle",
  accent:  "bg-accent/10 text-accent-text border border-accent/30",
  ai:      "bg-ai/10     text-ai          border border-ai/30",
  ok:      "bg-ok/10     text-ok          border border-ok/30",
  warn:    "bg-warn/10   text-warn        border border-warn/30",
  err:     "bg-err/10    text-err         border border-err/30",
  info:    "bg-info/10   text-info        border border-info/30",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  function Badge({ tone = "neutral", size = "md", leading, className, children, ...rest }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 font-medium whitespace-nowrap rounded-full",
          size === "sm"
            ? "h-[18px] px-1.5 text-[10px]"
            : "h-[20px] px-2   text-[11px]",
          BADGE_TONE[tone],
          className,
        )}
        {...rest}
      >
        {leading}
        {children}
      </span>
    );
  },
);
Badge.displayName = "Badge";
