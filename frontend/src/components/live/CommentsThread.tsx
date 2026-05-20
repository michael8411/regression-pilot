/**
 * Phase 05 — Comments thread panel.
 *
 * Each comment row uses <InitialAvatar> for the author, putting comments on
 * the same visual rail as pinned table, activity feed, and drawer composer.
 *
 * Rendered as a tab panel inside the drawer (no longer wraps itself in a
 * section heading — the tab label is the heading).
 */

import { InitialAvatar } from "@/components/live/visual";
import type { JiraComment } from "@/types";

interface Props {
  comments: JiraComment[];
}

export function CommentsThread({ comments }: Props) {
  if (comments.length === 0) {
    return (
      <div
        id="drawer-panel-comments"
        role="tabpanel"
        aria-labelledby="drawer-tab-comments"
        className="px-4 py-8 text-center"
      >
        <p className="text-[12px] text-ink-secondary mb-1">No comments yet</p>
        <p className="text-[11.5px] text-ink-faint">
          Be the first to add context using the composer below.
        </p>
      </div>
    );
  }

  return (
    <ul
      id="drawer-panel-comments"
      role="tabpanel"
      aria-labelledby="drawer-tab-comments"
      className="flex flex-col gap-2.5"
    >
      {comments.map((c, i) => {
        const isAi = (c.author || "").toLowerCase().includes("ai assistant");
        return (
          <li
            key={`${c.created}-${i}`}
            className="flex gap-2 rounded-md border border-subtle bg-surface-elevated px-3 py-2"
          >
            <InitialAvatar
              name={c.author || "Unknown"}
              special={isAi ? "ai" : undefined}
              size={24}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[10.5px] text-ink-faint mb-0.5">
                <span className="text-ink-secondary font-medium truncate">
                  {c.author || "Unknown"}
                </span>
                <span className="font-mono">{relative(c.created)}</span>
              </div>
              <pre className="font-sans text-[11.5px] text-ink-secondary whitespace-pre-wrap leading-relaxed m-0">
                {c.body}
              </pre>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function relative(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}
