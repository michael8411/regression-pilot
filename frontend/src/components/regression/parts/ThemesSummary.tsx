import { ArrowLeft, Layers } from "@/lib/icons";
import { Button } from "@/components/ui";
import type { JiraTicket } from "@/types";
import { cn } from "@/lib/cn";

export interface ThemesSummaryProps {
  themes: Record<string, JiraTicket[]>;
  onEditThemes: () => void;
  /** Disable the "Edit themes" link while a generation is in flight. */
  disabled?: boolean;
}

/**
 * Read-only summary panel of the user's themes. Shown next to the
 * Guidance panel on the Generate screen. Each row shows the theme
 * name and ticket count; an "Edit themes" footer link sends the user
 * back to the ThemeEditor.
 */
export function ThemesSummary({
  themes,
  onEditThemes,
  disabled,
}: ThemesSummaryProps) {
  const entries = Object.entries(themes).filter(([, list]) => list.length > 0);
  const totalTickets = entries.reduce((sum, [, list]) => sum + list.length, 0);

  return (
    <aside
      className={cn(
        "w-[320px] shrink-0 flex flex-col",
        "rounded-lg border border-subtle bg-surface-elevated",
      )}
      aria-label="Themes summary"
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-subtle">
        <Layers size={14} className="text-ink-muted shrink-0" aria-hidden />
        <h2 className="t-title text-ink flex-1 min-w-0 truncate">Themes</h2>
        {entries.length > 0 && (
          <span className="text-[11px] text-ink-muted tabular-nums">
            {entries.length} · {totalTickets}
          </span>
        )}
      </header>

      <ul className="flex-1 min-h-0 overflow-y-auto px-2 py-1 max-h-[60vh]">
        {entries.length === 0 ? (
          <li className="px-2 py-3 text-[12px] text-ink-muted">
            No themes yet.{" "}
            <button
              type="button"
              onClick={onEditThemes}
              disabled={disabled}
              className="underline hover:text-ink-secondary disabled:no-underline disabled:cursor-not-allowed"
            >
              Set them up.
            </button>
          </li>
        ) : (
          entries.map(([name, list]) => {
            const isNeedsReview = name === "Needs Review";
            return (
              <li
                key={name}
                className={cn(
                  "flex items-center justify-between gap-2 px-2 py-1.5 rounded-md",
                  "text-[13px]",
                  isNeedsReview ? "text-warn" : "text-ink-secondary",
                )}
                title={isNeedsReview ? "AI couldn't categorize these" : name}
              >
                <span className="flex-1 min-w-0 truncate">{name}</span>
                <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                  {list.length}
                </span>
              </li>
            );
          })
        )}
      </ul>

      <footer className="px-3 py-2 border-t border-subtle">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEditThemes}
          disabled={disabled}
          leading={<ArrowLeft size={12} />}
          fullWidth
        >
          Edit themes
        </Button>
      </footer>
    </aside>
  );
}
