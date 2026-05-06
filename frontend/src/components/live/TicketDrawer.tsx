import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { useTicketDetail } from "./hooks/useTicketDetail";
import { usePinnedKeys } from "./hooks/usePinnedKeys";
import { DrawerHeader } from "./DrawerHeader";
import { DrawerSummary } from "./DrawerSummary";
import { DrawerDescription } from "./DrawerDescription";
import { CommentsThread } from "./CommentsThread";
import { CommentComposer } from "./CommentComposer";
import { LiveGeneratePanel } from "./LiveGeneratePanel";

interface Props {
  ticketKey: string;
  onClose: () => void;
}

export function TicketDrawer({ ticketKey, onClose }: Props) {
  const { ticket, loading, error, refresh, addLocalComment } =
    useTicketDetail(ticketKey);
  const { isPinned, toggle } = usePinnedKeys();
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  useEffect(() => {
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
          "fixed top-0 right-0 z-[7700] h-full w-[480px] max-w-[90vw]",
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
              <DrawerSummary ticket={ticket} />
              <DrawerDescription description={ticket.description} />
              <CommentsThread comments={ticket.comments} />

              {showGenerate && (
                <LiveGeneratePanel
                  ticket={ticket}
                  onClose={() => setShowGenerate(false)}
                />
              )}

              <div className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setShowGenerate((v) => !v)}
                  className="g-btn text-[12px] w-full"
                >
                  {showGenerate ? "Hide generator" : "Generate live test cases"}
                </button>
              </div>
            </>
          )}
        </div>

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
