import { clsx } from "clsx";
import {
  AlertCircle,
  Folder,
  ListChecks,
  Ticket,
  Wrench,
  X,
  type IconComponent,
} from "@/lib/icons";
import type { Attachment } from "@/types/conversations";
import {
  decodeTestCaseRef,
  decodeToolRef,
} from "@/components/assistant/lib/attachmentUtils";

interface Props {
  attachment: Attachment;
  /** Optional resolved label override — used by hosts that have richer data. */
  label?: string;
  /** True if the underlying ref no longer resolves (e.g., session deleted). */
  stale?: boolean;
  onRemove: (id: string) => void;
}

export function AttachmentChip({ attachment, label, stale, onRemove }: Props) {
  const { id, kind, ref } = attachment;
  const display = label ?? defaultLabel(kind, ref);
  const Icon = iconFor(kind);

  return (
    <div
      role="group"
      aria-label={`${kind} attachment ${display}`}
      className={clsx(
        "group inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11.5px]",
        "bg-surface-overlay border-subtle text-ink-secondary",
        stale && "opacity-60 border-warn/30",
      )}
    >
      {stale ? (
        <AlertCircle size={11} className="text-warn" />
      ) : (
        <Icon size={11} className="text-accent-text" />
      )}
      <span className="truncate max-w-[180px]">{display}</span>
      <button
        type="button"
        aria-label="Remove"
        onClick={() => onRemove(id)}
        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity text-ink-muted hover:text-ink"
      >
        <X size={11} />
      </button>
    </div>
  );
}

function iconFor(kind: Attachment["kind"]): IconComponent {
  if (kind === "ticket") return Ticket;
  if (kind === "test_case") return ListChecks;
  if (kind === "mcp_tool") return Wrench;
  return Folder;
}

function defaultLabel(kind: Attachment["kind"], ref: string): string {
  if (kind === "ticket") return ref;
  if (kind === "test_case") {
    const decoded = decodeTestCaseRef(ref);
    return decoded ? `Test #${decoded.index + 1}` : "Test case";
  }
  if (kind === "mcp_tool") {
    const decoded = decodeToolRef(ref);
    return decoded ? decoded.tool : "Tool";
  }
  return "Session";
}
