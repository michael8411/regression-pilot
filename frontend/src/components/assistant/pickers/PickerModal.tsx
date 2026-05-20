import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@/lib/icons";

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

/** Lightweight modal for picker dialogs. Esc + backdrop click close. */
export function PickerModal({ title, children, onClose }: Props) {
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
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-[7500] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[90vw] rounded-xl border border-subtle bg-surface-elevated shadow-float"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
