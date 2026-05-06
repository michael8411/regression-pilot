import { useState } from "react";
import { useAttachments } from "@/components/assistant/hooks/useAttachments";
import { ContextPickerHeader } from "./ContextPickerHeader";
import { AttachmentList } from "./AttachmentList";
import { TicketPicker } from "./pickers/TicketPicker";
import { TestCasePicker } from "./pickers/TestCasePicker";
import { SessionPicker } from "./pickers/SessionPicker";

type ActivePicker = null | "ticket" | "test_case" | "session_ref";

export function ContextPicker() {
  const { attachments, add, remove } = useAttachments();
  const [picker, setPicker] = useState<ActivePicker>(null);

  return (
    <div className="flex flex-col h-full">
      <ContextPickerHeader onPick={(k) => setPicker(k)} />
      <div className="flex-1 overflow-y-auto">
        <AttachmentList
          attachments={attachments}
          onRemove={(id) => void remove(id)}
        />
      </div>

      {picker === "ticket" && (
        <TicketPicker
          onPick={async (key) => {
            try {
              await add("ticket", key);
            } finally {
              setPicker(null);
            }
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "test_case" && (
        <TestCasePicker
          onPick={async (refs) => {
            try {
              for (const r of refs) await add("test_case", r);
            } finally {
              setPicker(null);
            }
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "session_ref" && (
        <SessionPicker
          onPick={async (sid) => {
            try {
              await add("session_ref", sid);
            } finally {
              setPicker(null);
            }
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
