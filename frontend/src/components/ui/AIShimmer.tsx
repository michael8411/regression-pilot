import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface AIShimmerProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: number;
  rounded?: boolean;
}

export const AIShimmer = forwardRef<HTMLDivElement, AIShimmerProps>(
  function AIShimmer(
    { width = "40%", height = 12, rounded = true,
      "aria-label": ariaLabel = "Generating", className, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="status"
        aria-label={ariaLabel}
        className={cn(
          "animate-shimmer",
          rounded && "rounded-sm",
          className,
        )}
        style={{ width, height }}
        {...rest}
      />
    );
  },
);
AIShimmer.displayName = "AIShimmer";
