import { cn } from "@/lib/cn";
import { StatusDot, type StatusTone } from "./StatusDot";

export type Priority = "Critical" | "High" | "Medium" | "Low";

export interface PriorityPillProps {
  priority: Priority;
  size?: "sm" | "md";
  className?: string;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  Critical: "bg-err/10  text-err  border border-err/30",
  High:     "bg-warn/10 text-warn border border-warn/30",
  Medium:   "bg-info/10 text-info border border-info/30",
  Low:      "bg-surface-overlay text-ink-secondary border border-subtle",
};

const PRIORITY_DOT: Record<Priority, StatusTone> = {
  Critical: "err",
  High:     "warn",
  Medium:   "info",
  Low:      "muted",
};

export function PriorityPill({ priority, size = "md", className }: PriorityPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-full whitespace-nowrap",
        size === "sm"
          ? "h-[18px] px-1.5 text-[10px]"
          : "h-[20px] px-2   text-[11px]",
        PRIORITY_STYLE[priority],
        className,
      )}
      title={`Priority: ${priority}`}
    >
      <StatusDot tone={PRIORITY_DOT[priority]} size="sm" aria-hidden />
      {priority}
    </span>
  );
}
PriorityPill.displayName = "PriorityPill";
