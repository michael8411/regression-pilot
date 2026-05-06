import { useMemo } from "react";
import { MessageSquarePlus } from "@/lib/icons";
import { ConversationList } from "./ConversationList";
import { ConversationProvider } from "./ConversationProvider";
import { ConversationThread } from "./ConversationThread";
import { ContextPicker } from "./ContextPicker";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import * as api from "@/components/assistant/lib/api";
import type { Route } from "@/types/routing";

export function AssistantWorkspace() {
  const { route, gotoConversation } = useRoute();
  const conversationId = currentConversationId(route);

  const newConversationCommand = useMemo<CommandItem>(
    () => ({
      id: "assistant.new-conversation",
      group: "action",
      label: "New conversation",
      sub: "Assistant",
      icon: MessageSquarePlus,
      keywords: ["chat", "assistant", "new"],
      action: {
        type: "run",
        run: async () => {
          const c = await api.createConversation();
          gotoConversation(c.id);
        },
      },
    }),
    [gotoConversation],
  );
  useRegisterCommand(newConversationCommand);

  return (
    <ConversationProvider conversationId={conversationId}>
      <div className="flex h-full overflow-hidden">
        <div className="w-[260px] shrink-0 bg-surface">
          <ConversationList selectedId={conversationId} />
        </div>
        <div className="flex-1 flex flex-col min-w-0 bg-surface">
          {conversationId ? (
            <ConversationThread />
          ) : (
            <NoConversationSelected />
          )}
        </div>
        {conversationId && (
          <div className="w-[280px] shrink-0 border-l border-subtle bg-surface">
            <ContextPicker />
          </div>
        )}
      </div>
    </ConversationProvider>
  );
}

function currentConversationId(route: Route): string | null {
  if (
    route[0] === "assistant" &&
    route[1] === "conversation" &&
    typeof route[2] === "string"
  ) {
    return route[2];
  }
  return null;
}

function NoConversationSelected() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center px-6">
      <div className="text-[13px] text-ink-muted max-w-sm leading-relaxed">
        Select a conversation on the left, or start a new one to chat about
        regression strategy, ticket coverage, or generated test cases.
      </div>
    </div>
  );
}

