import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonVariant = "neutral" | "danger" | "ai";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  icon: ReactNode;
  "aria-label": string;
  tooltip?: string;
  size?: IconButtonSize;
  active?: boolean;
  variant?: IconButtonVariant;
}

const IB_SIZE: Record<IconButtonSize, string> = {
  sm: "h-6 w-6 rounded-md [&>svg]:w-[14px] [&>svg]:h-[14px]",
  md: "h-8 w-8 rounded-lg [&>svg]:w-4 [&>svg]:h-4",
  lg: "h-10 w-10 rounded-lg [&>svg]:w-5 [&>svg]:h-5",
};

const IB_VARIANT: Record<IconButtonVariant, string> = {
  neutral: "text-ink-secondary hover:text-ink hover:bg-surface-overlay",
  danger:  "text-err hover:bg-err/10",
  ai:      "text-ai hover:bg-ai/10",
};

const IB_ACTIVE = "bg-accent/15 text-accent-text border border-accent/30";

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { icon, tooltip, size = "md", active = false, variant = "neutral",
      className, type = "button", ...rest },
    ref,
  ) {
    const btn = (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center",
          "transition-colors duration-fast ease-smooth",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          IB_SIZE[size],
          active ? IB_ACTIVE : IB_VARIANT[variant],
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    );
    if (!tooltip) return btn;
    return <Tooltip label={tooltip}>{btn}</Tooltip>;
  },
);
IconButton.displayName = "IconButton";
