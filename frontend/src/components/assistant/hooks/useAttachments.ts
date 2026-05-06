import { useCallback, useMemo } from "react";
import * as api from "@/components/assistant/lib/api";
import { useConversation } from "@/components/assistant/ConversationProvider";
import type { Attachment, AttachmentKind } from "@/types/conversations";

export interface UseAttachmentsResult {
  attachments: Attachment[];
  add: (kind: AttachmentKind, ref: string) => Promise<Attachment>;
  remove: (id: string) => Promise<void>;
}

export function useAttachments(): UseAttachmentsResult {
  const conversation = useConversation();
  const cid = conversation.conversationId;

  const attachments = conversation.attachments;

  const add = useCallback(
    async (kind: AttachmentKind, ref: string) => {
      if (!cid) throw new Error("No conversation selected");
      const created = await api.addAttachment(cid, { kind, ref });
      await conversation.refresh();
      return created;
    },
    [cid, conversation],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!cid) return;
      await api.removeAttachment(cid, id);
      await conversation.refresh();
    },
    [cid, conversation],
  );

  return useMemo(
    () => ({ attachments, add, remove }),
    [attachments, add, remove],
  );
}
