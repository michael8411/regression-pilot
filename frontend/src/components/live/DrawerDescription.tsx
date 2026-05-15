/**
 * Phase 05 — drawer description renderer.
 *
 * Renders inside <MarkdownPanel> per the visual contract. Used as the
 * top body of the Description tab.
 */

import { Markdown } from "@/components/assistant/lib/markdown";
import { MarkdownPanel } from "@/components/live/visual";

export function DrawerDescription({ description }: { description: string }) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-wider text-ink-muted font-mono mb-1.5">
        Description
      </h3>
      {description?.trim() ? (
        <MarkdownPanel>
          <Markdown source={description} />
        </MarkdownPanel>
      ) : (
        <MarkdownPanel>
          <p className="text-[11.5px] text-ink-faint italic">
            No description provided.
          </p>
        </MarkdownPanel>
      )}
    </section>
  );
}
