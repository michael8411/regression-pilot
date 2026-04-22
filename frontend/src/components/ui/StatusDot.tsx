import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type StatusTone =
  | "ok"
  | "warn"
  | "err"
  | "info"
  | "ai"
  | "muted";

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  pulse?: boolean;
  size?: "sm" | "md";
}

const TONE: Record<StatusTone, string> = {
  ok:    "bg-ok    shadow-[0_0_8px_rgba(34,197,94,0.35)]",
  warn:  "bg-warn  shadow-[0_0_8px_rgba(245,158,11,0.35)]",
  err:   "bg-err   shadow-[0_0_8px_rgba(248,113,113,0.35)]",
  info:  "bg-info  shadow-[0_0_8px_rgba(96,165,250,0.35)]",
  ai:    "bg-ai    shadow-[0_0_8px_rgba(167,139,250,0.35)]",
  muted: "bg-ink-faint",
};

export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(
  function StatusDot({ tone, pulse = false, size = "md", className, ...rest }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-block rounded-full shrink-0",
          size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
          TONE[tone],
          pulse && "animate-pulse-dot",
          className,
        )}
        {...rest}
      />
    );
  },
);
StatusDot.displayName = "StatusDot";
