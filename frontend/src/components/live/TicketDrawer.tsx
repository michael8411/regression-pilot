/**
 * Phase 05 — tabbed ticket drawer.
 *
 * Five tabs: Description · Comments · Attachments · Test Cases · AI.
 * A sticky CTA "Generate test cases for this ticket · Ctrl G" sits in the
 * footer on every tab and triggers the AI panel's generate handler.
 *
 * Preserved behaviors:
 *  - Escape closes, focus returns to the previously-active element.
 *  - Body scroll is locked while open.
 *  - Pin/unpin survives.
 *  - Comment composer survives.
 *  - Generation pipeline is unchanged (re-uses useLiveGenerate).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { Sparkles } from "@/lib/icons";
import { useTicketDetail } from "./hooks/useTicketDetail";
import { usePinnedKeys } from "./hooks/usePinnedKeys";
import { DrawerHeader } from "./DrawerHeader";
import { DrawerSummary } from "./DrawerSummary";
import { DrawerDescription } from "./DrawerDescription";
import { CommentsThread } from "./CommentsThread";
import { CommentComposer } from "./CommentComposer";
import {
  DrawerAiPanel,
  DrawerAttachmentsPanel,
  DrawerCasesPanel,
  DrawerTabs,
  type DrawerAiPanelHandle,
  type DrawerTabItem,
} from "./drawer";

interface Props {
  ticketKey: string;
  onClose: () => void;
}

type TabId = "description" | "comments" | "attachments" | "cases" | "ai";

export function TicketDrawer({ ticketKey, onClose }: Props) {
  const { ticket, loading, error, refresh, addLocalComment } =
    useTicketDetail(ticketKey);
  const { isPinned, toggle } = usePinnedKeys();
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const aiPanelRef = useRef<DrawerAiPanelHandle | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("description");

  // Focus management + Esc + Ctrl-G generation hotkey.
  useEffect(() => {
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.ctrlKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        aiPanelRef.current?.generate();
      }
    };
    document.addEventListener("keydown", onKey);
    drawerRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      triggerRef.current?.focus();
    };
  }, [onClose]);

  const handleGenerateCTA = useCallback(() => {
    aiPanelRef.current?.generate();
  }, []);

  const goToAiTab = useCallback(() => setActiveTab("ai"), []);

  const commentCount = ticket?.comments?.length ?? 0;

  const tabs: DrawerTabItem[] = [
    { id: "description", label: "Description" },
    { id: "comments", label: "Comments", count: commentCount },
    { id: "attachments", label: "Attachments", count: 0 },
    { id: "cases", label: "Test Cases", count: 0 },
    { id: "ai", label: "AI", variant: "ai" },
  ];

  return createPortal(
    <>
      <div
        onClick={onClose}
        aria-hidden
        className="fixed inset-0 z-[7600] bg-black/30 backdrop-blur-sm animate-fade-in"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Ticket ${ticketKey}`}
        tabIndex={-1}
        className={clsx(
          "fixed top-0 right-0 z-[7700] h-full w-[640px] max-w-[90vw]",
          "border-l border-subtle bg-surface-elevated shadow-float",
          "flex flex-col animate-slide-in-right",
          "focus:outline-none",
        )}
      >
        <DrawerHeader
          ticketKey={ticketKey}
          ticket={ticket}
          isPinned={isPinned(ticketKey)}
          onTogglePin={() => toggle(ticketKey)}
          onClose={onClose}
        />

        {ticket && (
          <DrawerTabs
            items={tabs}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && !ticket ? (
            <div className="px-4 py-6 text-[12px] text-ink-faint">Loading…</div>
          ) : error ? (
            <div className="px-4 py-6 text-[12px] text-err">
              {error}
              <button
                type="button"
                onClick={() => void refresh()}
                className="ml-2 underline"
              >
                Retry
              </button>
            </div>
          ) : !ticket ? null : (
            <>
              {activeTab === "description" && (
                <div
                  id="drawer-panel-description"
                  role="tabpanel"
                  aria-labelledby="drawer-tab-description"
                  className="px-4 py-3 flex flex-col gap-4"
                >
                  <DrawerSummary ticket={ticket} />
                  <DrawerDescription description={ticket.description} />
                </div>
              )}

              {activeTab === "comments" && (
                <div className="px-4 py-3">
                  <CommentsThread comments={ticket.comments} />
                </div>
              )}

              {activeTab === "attachments" && <DrawerAttachmentsPanel />}

              {activeTab === "cases" && <DrawerCasesPanel onGoToAi={goToAiTab} />}

              {activeTab === "ai" && (
                <DrawerAiPanel ref={aiPanelRef} ticket={ticket} />
              )}
            </>
          )}
        </div>

        {/* Sticky AI CTA — visible on every tab */}
        {ticket && (
          <div className="border-t border-subtle px-3 py-2 bg-surface-elevated">
            <button
              type="button"
              onClick={handleGenerateCTA}
              className={clsx(
                "w-full flex items-center justify-center gap-2 rounded-full",
                "px-3 py-2 text-[12px] font-medium text-ai",
                "transition-shadow hover:shadow-ai",
              )}
              style={{ background: "var(--ai-dim)" }}
              title="Generate test cases (Ctrl G)"
            >
              <Sparkles size={12} />
              <span>Generate test cases for this ticket</span>
              <span className="text-[10px] font-mono opacity-70">Ctrl G</span>
            </button>
          </div>
        )}

        {ticket && (
          <CommentComposer
            ticketKey={ticketKey}
            onPosted={(c) => addLocalComment(c)}
          />
        )}
      </aside>
    </>,
    document.body,
  );
}
