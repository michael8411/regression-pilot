import { useMemo } from "react";
import { useAutoScroll } from "@/components/assistant/hooks/useAutoScroll";
import { useConversation } from "@/components/assistant/ConversationProvider";
import { useThreadController } from "@/components/assistant/hooks/useThreadController";
import type { Message } from "@/types/conversations";
import { MessageBubble } from "./MessageBubble";
import { StreamingIndicator } from "./StreamingIndicator";
import { ToolApprovalCard } from "@/components/mcp/ToolApprovalCard";

export function MessageList() {
  const { current, streaming, pendingToolCalls } = useConversation();
  const { regenerateLast } = useThreadController();
  const messages = current?.messages ?? [];

  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  const tailLength = messages[messages.length - 1]?.content.length ?? 0;
  const { ref } = useAutoScroll([
    messages.length,
    tailLength,
    streaming,
    pendingToolCalls.length,
  ]);

  const handleCopy = async (m: Message) => {
    try {
      await navigator.clipboard.writeText(m.content);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      aria-live="polite"
    >
      {messages.length === 0 && pendingToolCalls.length === 0 && (
        <div className="text-center text-[12px] text-ink-faint py-8">
          Start the conversation. The assistant has no context until you do.
        </div>
      )}
      {messages.map((m, i) => (
        <MessageBubble
          key={m.id}
          message={m}
          isLastAssistant={i === lastAssistantIdx}
          streaming={streaming && i === messages.length - 1}
          onCopy={handleCopy}
          onRegenerate={regenerateLast}
        />
      ))}
      {pendingToolCalls.map((call) => (
        <ToolApprovalCard key={call.request_id} call={call} />
      ))}
      {streaming && messages[messages.length - 1]?.role !== "assistant" && (
        <StreamingIndicator />
      )}
    </div>
  );
}
