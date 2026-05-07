import { useMemo } from "react";
import type { Attachment } from "@/types/conversations";
import { AttachmentChip } from "./AttachmentChip";
import { useResolvedAttachments } from "./hooks/useResolvedAttachments";

interface Props {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

const SECTION_ORDER: Attachment["kind"][] = [
  "ticket",
  "test_case",
  "session_ref",
  "mcp_tool",
];
const SECTION_LABEL: Record<Attachment["kind"], string> = {
  ticket: "Tickets",
  test_case: "Test cases",
  session_ref: "Session",
  mcp_tool: "Tools",
};

export function AttachmentList({ attachments, onRemove }: Props) {
  const grouped = useMemo(() => {
    const buckets: Record<Attachment["kind"], Attachment[]> = {
      ticket: [],
      test_case: [],
      session_ref: [],
      mcp_tool: [],
    };
    for (const a of attachments) buckets[a.kind].push(a);
    return buckets;
  }, [attachments]);

  const resolved = useResolvedAttachments(attachments);

  if (attachments.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[11.5px] text-ink-faint">
        No context attached. Add tickets or test cases so the assistant can
        ground its answers.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {SECTION_ORDER.map((kind) =>
        grouped[kind].length > 0 ? (
          <div key={kind} className="flex flex-col gap-1.5">
            <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold">
              {SECTION_LABEL[kind]} · {grouped[kind].length}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {grouped[kind].map((a) => {
                const r = resolved.get(a.id);
                return (
                  <AttachmentChip
                    key={a.id}
                    attachment={a}
                    label={r?.label}
                    stale={r?.stale}
                    onRemove={onRemove}
                  />
                );
              })}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}
