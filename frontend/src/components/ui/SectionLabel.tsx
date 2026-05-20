import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  trailing?: ReactNode;
}

export const SectionLabel = forwardRef<HTMLDivElement, SectionLabelProps>(
  function SectionLabel({ children, trailing, className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-between",
          "t-label",
          "px-5 pt-4 pb-1",
          className,
        )}
        {...rest}
      >
        <span>{children}</span>
        {trailing && <span className="text-ink-muted">{trailing}</span>}
      </div>
    );
  },
);
SectionLabel.displayName = "SectionLabel";
