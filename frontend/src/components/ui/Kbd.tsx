import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface KbdProps extends HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export interface KbdPillProps {
  keys: string;
  className?: string;
}

export const Kbd = forwardRef<HTMLSpanElement, KbdProps>(
  function Kbd({ className, children, ...rest }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center",
          "min-w-[18px] h-[18px] px-1",
          "rounded border border-muted bg-surface-overlay",
          "text-[10px] font-medium font-mono",
          "text-ink-secondary",
          className,
        )}
        {...rest}
      >
        {children}
      </span>
    );
  },
);
Kbd.displayName = "Kbd";

function displayForPlatform(key: string): string {
  const isMac = typeof navigator !== "undefined" &&
    navigator.platform.toLowerCase().includes("mac");
  if (key === "Mod") return isMac ? "⌘" : "Ctrl";
  if (key === "Shift") return "⇧";
  if (key === "Alt")   return isMac ? "⌥" : "Alt";
  if (key === "Enter") return "↵";
  if (key === "Esc")   return "Esc";
  return key;
}

export function KbdPill({ keys, className }: KbdPillProps) {
  const parts = keys.split(" ").filter(Boolean).map(displayForPlatform);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {parts.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </span>
  );
}
KbdPill.displayName = "KbdPill";
