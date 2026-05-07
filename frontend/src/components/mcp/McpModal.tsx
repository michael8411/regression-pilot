import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@/lib/icons";

interface Props {
  title: string;
  ariaLabel?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

/** Lightweight portal modal — Esc + backdrop dismiss, scroll lock. */
export function McpModal({
  title,
  ariaLabel,
  width = 520,
  children,
  footer,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onClick={onClose}
      className="fixed inset-0 z-[7800] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px, 90vw)` }}
        className="rounded-xl border border-subtle bg-surface-elevated shadow-float flex flex-col max-h-[90vh]"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink"
          >
            <X size={13} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 px-4 py-3 border-t border-subtle">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
