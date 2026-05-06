import { useConversation } from "@/components/assistant/ConversationProvider";
import { ThreadHeader } from "./ThreadHeader";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export function ConversationThread() {
  const { loading, error, current, refresh } = useConversation();

  if (loading && !current) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center text-[12px] text-ink-faint">
          Loading conversation…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 px-6 text-center">
        <p className="text-[13px] text-err">Failed to load: {error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="g-btn text-[12px]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="flex flex-col h-full">
      <ThreadHeader />
      <MessageList />
      <Composer />
    </div>
  );
}
