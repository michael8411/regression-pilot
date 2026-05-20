import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  interactive?: boolean;
  as?: "div" | "article" | "section" | "button" | "a";
  children: ReactNode;
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card = forwardRef<HTMLElement, CardProps>(
  function Card(
    { elevated = false, interactive = false, as = "div", className, children, ...rest },
    ref,
  ) {
    const Comp = as as ElementType;
    return (
      <Comp
        ref={ref as Ref<HTMLElement>}
        className={cn(
          "rounded-xl border border-muted bg-surface-elevated",
          elevated && "shadow-float",
          interactive && "cursor-pointer transition-colors duration-fast ease-smooth hover:border-strong hover:bg-surface-overlay",
          className,
        )}
        {...rest}
      >
        {children}
      </Comp>
    );
  },
);
Card.displayName = "Card";

export function CardHeader({ className, children, ...rest }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 pt-4 pb-3",
        "border-b border-subtle",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
CardHeader.displayName = "CardHeader";

export function CardBody({ className, children, padded = true, ...rest }: CardBodyProps) {
  return (
    <div className={cn(padded ? "p-5" : "", className)} {...rest}>
      {children}
    </div>
  );
}
CardBody.displayName = "CardBody";

export function CardFooter({ className, children, ...rest }: CardFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 px-5 py-3",
        "border-t border-subtle",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
CardFooter.displayName = "CardFooter";
