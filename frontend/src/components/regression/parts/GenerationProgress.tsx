import { Loader2, Sparkles } from "@/lib/icons";
import type { JiraTicket } from "@/types";
import { cn } from "@/lib/cn";

export interface GenerationProgressProps {
  themes: Record<string, JiraTicket[]>;
}

/**
 * Right-pane swap-in while generation is in flight.
 *
 * The backend's /ai/generate is non-streaming, so this panel doesn't
 * pretend to know per-theme progress. It shows an honest "in-flight"
 * state with the theme list visible so the user knows what the AI is
 * working through.
 */
export function GenerationProgress({ themes }: GenerationProgressProps) {
  const entries = Object.entries(themes).filter(([, list]) => list.length > 0);
  const themeCount = entries.length;

  return (
    <div
      className={cn(
        "flex-1 flex flex-col items-center justify-center px-8 py-12",
        "rounded-lg border border-subtle bg-surface-elevated",
      )}
    >
      <div className="relative flex items-center justify-center">
        <Sparkles size={32} className="text-accent" aria-hidden />
        <Loader2
          size={56}
          className="absolute -inset-3 animate-spin-fast text-accent/40"
          aria-hidden
        />
      </div>

      <h3
        className="t-title text-ink mt-6"
        role="status"
        aria-live="polite"
      >
        Generating test cases…
      </h3>

      <p className="t-meta text-ink-muted mt-1 max-w-sm text-center">
        Working through {themeCount} {themeCount === 1 ? "theme" : "themes"}.
        This usually takes 30–60 seconds.
      </p>

      {entries.length > 0 && (
        <ul className="mt-6 space-y-1 text-[12px] text-ink-muted">
          {entries.map(([name, list]) => (
            <li key={name} className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse-dot"
                aria-hidden
              />
              <span className="text-ink-secondary">{name}</span>
              <span className="text-ink-faint tabular-nums">
                ({list.length})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
