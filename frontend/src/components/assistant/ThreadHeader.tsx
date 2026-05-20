import { useEffect, useState } from "react";
import { ShieldAlert, X } from "@/lib/icons";
import { useConversation } from "@/components/assistant/ConversationProvider";

export function ThreadHeader() {
  const { current, lastWarnings, clearWarnings } = useConversation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (lastWarnings.length > 0) {
      setShow(true);
      const t = setTimeout(() => setShow(false), 8000);
      return () => clearTimeout(t);
    }
  }, [lastWarnings]);

  if (!current) return null;
  const { conversation, messages } = current;

  return (
    <div className="border-b border-subtle">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-ink truncate">
            {conversation.title}
          </h2>
          <p className="text-[10.5px] text-ink-faint">
            {messages.length} {messages.length === 1 ? "message" : "messages"}
            <span className="ml-1.5">· Gemini 2.5 Flash</span>
          </p>
        </div>
      </div>
      {show && lastWarnings.length > 0 && (
        <div
          role="alert"
          className="mx-4 mb-2 flex items-start gap-2 px-3 py-2 rounded-md border border-warn/30 bg-warn/[0.06] text-warn text-[11.5px]"
        >
          <ShieldAlert size={12} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            Your message contained content that looked like a credential. The
            content was saved as-is, but you may want to remove it.
            <span className="block mt-1 opacity-80">
              Patterns detected:{" "}
              {lastWarnings.map((w) => w.pattern_name).join(", ")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setShow(false);
              clearWarnings();
            }}
            aria-label="Dismiss warning"
            className="text-warn/70 hover:text-warn"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
