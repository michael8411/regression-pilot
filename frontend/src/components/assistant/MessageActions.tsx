import { clsx } from "clsx";
import { Copy, RotateCcw } from "@/lib/icons";
import type { Message } from "@/types/conversations";

interface Props {
  message: Message;
  onCopy: () => void;
  onRegenerate?: () => void;
}

export function MessageActions({ message, onCopy, onRegenerate }: Props) {
  const isUser = message.role === "user";
  return (
    <div
      className={clsx(
        "flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <button
        type="button"
        onClick={onCopy}
        title="Copy"
        aria-label="Copy message"
        className="px-1.5 py-0.5 rounded text-[10.5px] text-ink-muted hover:text-ink hover:bg-surface-overlay flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Copy size={10} /> Copy
      </button>
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          title="Regenerate"
          aria-label="Regenerate"
          className="px-1.5 py-0.5 rounded text-[10.5px] text-ink-muted hover:text-ink hover:bg-surface-overlay flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <RotateCcw size={10} /> Regenerate
        </button>
      )}
    </div>
  );
}
