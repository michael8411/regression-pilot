import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { IconComponent } from "@/lib/icons";

export interface EmptyStateProps {
  icon: IconComponent;
  title: string;
  description: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Tone determines the icon halo color. Defaults to "muted". */
  tone?: "muted" | "accent" | "warn";
}

/**
 * Shared empty state for the regression workspace screens. Used when a
 * screen lands without its prerequisite data (e.g. Themes without
 * tickets, Review without test cases).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "muted",
}: EmptyStateProps) {
  const haloClass =
    tone === "accent"
      ? "bg-accent/10 text-accent-text"
      : tone === "warn"
      ? "bg-warn/10 text-warn"
      : "bg-surface-overlay text-ink-muted";

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 py-16 text-center animate-fade-in">
      <div className={cn("p-3 rounded-full", haloClass)}>
        <Icon size={28} />
      </div>
      <h3 className="t-title text-ink mt-4">{title}</h3>
      <p className="t-meta text-ink-muted max-w-sm mt-1">{description}</p>
      {action && (
        <Button variant="primary" className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
