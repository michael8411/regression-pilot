/**
 * Phase 05 — dark contained markdown surface.
 *
 * Locked in 00b: bg --surface-sunken, border --border-muted, mono inline code.
 * Used by the drawer Description tab and (later) the generated test-case
 * body panel.
 */

import type { ReactNode } from "react";
import { clsx } from "clsx";

interface Props {
  children: ReactNode;
  className?: string;
}

export function MarkdownPanel({ children, className }: Props) {
  return (
    <div
      className={clsx(
        "markdown-content",
        "rounded-lg border border-muted bg-surface-sunken",
        "px-3 py-2.5 text-[12px] text-ink-secondary leading-relaxed",
        className,
      )}
    >
      {children}
    </div>
  );
}
