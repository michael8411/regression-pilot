/**
 * Phase 05 — underline-style tabs for the ticket drawer.
 *
 * Per 00b:
 * - Inactive tabs: --ink-secondary, no underline.
 * - Active (non-AI): --accent text + 2px underline.
 * - AI tab: Sparkles prefix; hover/active use --ai (purple); underline --ai.
 * - Counts render inline in the label, never as separate pills.
 *
 * Supports arrow-key navigation per WAI-ARIA tablist semantics.
 */

import { clsx } from "clsx";
import { useRef } from "react";
import { Sparkles } from "@/lib/icons";
import { TAB_UNDERLINE_THICKNESS_PX } from "@/components/live/lib/visualTokens";

export interface DrawerTabItem {
  id: string;
  label: string;
  /** Optional inline count suffix; rendered as smaller, dimmer "(N)". */
  count?: number;
  /** Renders Sparkles prefix and routes color through --ai. */
  variant?: "ai";
}

interface Props {
  items: DrawerTabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export function DrawerTabs({ items, activeId, onChange }: Props) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const idx = items.findIndex((t) => t.id === activeId);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    const target = items[next];
    onChange(target.id);
    tabRefs.current[target.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Ticket sections"
      onKeyDown={handleKey}
      className="flex items-stretch gap-1 border-b border-subtle px-3 -mb-px"
    >
      {items.map((t) => {
        const active = t.id === activeId;
        const isAi = t.variant === "ai";

        const baseColor = active
          ? isAi
            ? "text-ai"
            : "text-accent-text"
          : "text-ink-secondary hover:text-ink";

        const aiHover = isAi && !active ? "hover:text-ai" : "";

        return (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            role="tab"
            type="button"
            id={`drawer-tab-${t.id}`}
            aria-controls={`drawer-panel-${t.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={clsx(
              "relative inline-flex items-center gap-1 px-2.5 py-2 text-[12px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-t",
              baseColor,
              aiHover,
            )}
          >
            {isAi && <Sparkles size={11} className={active ? "text-ai" : ""} />}
            <span>{t.label}</span>
            {typeof t.count === "number" && (
              <span className="text-[10.5px] text-ink-faint font-mono">
                ({t.count})
              </span>
            )}
            {active && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 4,
                  right: 4,
                  bottom: -1,
                  height: TAB_UNDERLINE_THICKNESS_PX,
                  background: isAi ? "var(--ai)" : "var(--accent)",
                  borderRadius: 1,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
