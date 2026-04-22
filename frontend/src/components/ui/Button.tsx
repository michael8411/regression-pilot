import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";
import { Kbd } from "./Kbd";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "ai";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leading?: ReactNode;
  trailing?: ReactNode;
  kbd?: string;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-accent text-white border border-accent",
    "hover:bg-accent-hover hover:shadow-glow-sm",
    "active:translate-y-px",
    "disabled:hover:bg-accent disabled:hover:shadow-none",
  ),
  secondary: cn(
    "bg-surface-overlay text-ink border border-muted",
    "hover:bg-surface-elevated hover:border-strong",
  ),
  ghost: cn(
    "bg-transparent text-ink-secondary border border-transparent",
    "hover:bg-surface-overlay hover:text-ink",
  ),
  danger: cn(
    "bg-transparent text-err border border-err/30",
    "hover:bg-err/10 hover:border-err/60",
  ),
  ai: cn(
    "bg-ai/10 text-ai border border-ai/30",
    "hover:bg-ai/15 hover:border-ai/50 hover:shadow-ai",
  ),
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7  px-2.5 text-[11.5px] gap-1.5 rounded-md",
  md: "h-8  px-3   text-[12.5px] gap-2   rounded-lg",
  lg: "h-10 px-4   text-[13.5px] gap-2   rounded-lg",
};

const BASE = cn(
  "inline-flex items-center justify-center",
  "font-medium whitespace-nowrap select-none",
  "transition-colors duration-fast ease-smooth",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
  "disabled:opacity-40 disabled:cursor-not-allowed",
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      leading,
      trailing,
      kbd,
      loading = false,
      fullWidth = false,
      disabled,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          BASE,
          SIZE[size],
          VARIANT[variant],
          fullWidth && "w-full",
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Spinner size={size === "sm" ? 12 : size === "lg" ? 16 : 14} />
        ) : (
          leading
        )}
        <span className="truncate">{children}</span>
        {trailing}
        {kbd && <Kbd className="ml-1">{kbd}</Kbd>}
      </button>
    );
  },
);
Button.displayName = "Button";
