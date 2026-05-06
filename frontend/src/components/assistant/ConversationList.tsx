import { Archive, Plus } from "@/lib/icons";
import { useConversations } from "@/components/assistant/hooks/useConversations";
import { useRoute } from "@/contexts/RouteContext";
import { ConversationRow } from "./ConversationRow";
import { ConversationListSkeleton } from "./ConversationListSkeleton";
import { ConversationListEmpty } from "./ConversationListEmpty";

interface Props {
  /** id from the route, used to highlight current row. */
  selectedId: string | null;
}

export function ConversationList({ selectedId }: Props) {
  const { gotoConversation, goto } = useRoute();
  const {
    conversations,
    loading,
    error,
    includeArchived,
    setIncludeArchived,
    refresh,
    create,
    rename,
    togglePin,
    toggleArchive,
    remove,
  } = useConversations();

  const handleNew = async () => {
    const c = await create();
    gotoConversation(c.id);
  };

  return (
    <aside
      className="flex flex-col h-full border-r border-subtle"
      aria-label="Conversations"
    >
      <header className="flex items-center justify-between px-3 py-2.5 border-b border-subtle">
        <h2 className="text-[12.5px] font-semibold text-ink">Conversations</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIncludeArchived(!includeArchived)}
            aria-pressed={includeArchived}
            title={includeArchived ? "Hide archived" : "Show archived"}
            className="w-7 h-7 rounded-md flex items-center justify-center text-ink-muted hover:bg-surface-overlay"
          >
            <Archive size={13} />
          </button>
          <button
            type="button"
            onClick={() => void handleNew()}
            title="New conversation"
            className="w-7 h-7 rounded-md flex items-center justify-center bg-accent-dim border border-accent/[0.15] text-accent-text hover:bg-accent/15"
          >
            <Plus size={13} />
          </button>
        </div>
      </header>

      {loading ? (
        <ConversationListSkeleton />
      ) : error ? (
        <div className="p-4 text-[12px] text-err">
          {error}
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-2 underline"
          >
            Retry
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <ConversationListEmpty onNew={() => void handleNew()} />
      ) : (
        <ul className="flex flex-col gap-1 p-2 overflow-y-auto flex-1">
          {conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              selected={c.id === selectedId}
              onSelect={(id) => gotoConversation(id)}
              onTogglePin={togglePin}
              onToggleArchive={toggleArchive}
              onRename={rename}
              onDelete={async (id) => {
                await remove(id);
                if (id === selectedId) goto(["assistant", "home"]);
              }}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
