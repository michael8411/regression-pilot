import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface AvatarData {
  initials: string;
  hue: number;
  label?: string;
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  a: AvatarData;
  size?: 20 | 24 | 28 | 32 | 40;
  ring?: boolean;
}

function fontSizeFor(size: number): number {
  if (size >= 40) return 14;
  if (size >= 32) return 12;
  if (size >= 28) return 11;
  if (size >= 24) return 10;
  return 9;
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  function Avatar({ a, size = 24, ring = false, className, ...rest }, ref) {
    const bg = `linear-gradient(135deg, oklch(0.72 0.14 ${a.hue}deg), oklch(0.58 0.16 ${a.hue}deg))`;
    return (
      <span
        ref={ref}
        role="img"
        aria-label={a.label ?? a.initials}
        title={a.label}
        className={cn(
          "inline-flex items-center justify-center shrink-0",
          "rounded-full text-white font-semibold select-none",
          ring && "ring-2 ring-accent/60 ring-offset-1 ring-offset-surface-base",
          className,
        )}
        style={{
          width: size,
          height: size,
          fontSize: fontSizeFor(size),
          background: bg,
        }}
        {...rest}
      >
        {a.initials}
      </span>
    );
  },
);
Avatar.displayName = "Avatar";
