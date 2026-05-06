import type { ConversationContextValue } from "@/components/assistant/ConversationProvider";

export interface SlashCommandContext {
  conversation: ConversationContextValue;
  composer: {
    setValue: (s: string) => void;
    submit: (overrideContent?: string) => Promise<void>;
  };
  /** Set in 7d when the picker mounts. Optional in 7c. */
  attachments?: {
    addByKey: (key: string) => Promise<void>;
  };
}

export interface SlashCommand {
  name: string;
  args?: string;
  description: string;
  /** Returns true if the command consumed the input (don't fall through to send). */
  run: (rawArgs: string, ctx: SlashCommandContext) => Promise<boolean>;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "clear",
    description: "Clear the composer without sending.",
    run: async (_args, { composer }) => {
      composer.setValue("");
      return true;
    },
  },
  {
    name: "system",
    args: "<message>",
    description: "Send a system message used as guidance for future replies.",
    run: async (args, { conversation, composer }) => {
      const text = args.trim();
      if (!text) return false;
      const { appendMessage } = await import("@/components/assistant/lib/api");
      if (!conversation.conversationId) return false;
      const res = await appendMessage(conversation.conversationId, {
        role: "system",
        content: text,
      });
      conversation.appendMessage(res.message);
      composer.setValue("");
      return true;
    },
  },
  {
    name: "attach",
    args: "<TICKET-KEY>",
    description: "Attach a Jira ticket to this conversation.",
    run: async (args, { attachments, composer }) => {
      const key = args.trim();
      if (!key || !attachments) return false;
      try {
        await attachments.addByKey(key);
        composer.setValue("");
        return true;
      } catch {
        return false;
      }
    },
  },
];

export function parseSlashInput(
  text: string,
): { match: SlashCommand; rawArgs: string } | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/")) return null;
  const space = trimmed.indexOf(" ");
  const name = (
    space < 0 ? trimmed.slice(1) : trimmed.slice(1, space)
  ).toLowerCase();
  const rawArgs = space < 0 ? "" : trimmed.slice(space + 1);
  const match = SLASH_COMMANDS.find((c) => c.name === name);
  return match ? { match, rawArgs } : null;
}

/** Returns the commands matching the prefix typed after `/`. */
export function matchSlashCommands(prefix: string): SlashCommand[] {
  const p = prefix.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(p));
}
