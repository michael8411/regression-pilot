import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Send, Square } from "@/lib/icons";
import { useConversation } from "@/components/assistant/ConversationProvider";
import { useThreadController } from "@/components/assistant/hooks/useThreadController";
import { useAttachments } from "@/components/assistant/hooks/useAttachments";
import {
  SLASH_COMMANDS,
  matchSlashCommands,
  parseSlashInput,
  type SlashCommand,
} from "@/components/assistant/lib/slashCommands";
import { SlashCommandMenu } from "./SlashCommandMenu";

export function Composer() {
  const conversation = useConversation();
  const { send, cancel } = useThreadController();
  const { add: addAttachment } = useAttachments();
  const [value, setValue] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const slashPrefix = useMemo(() => {
    const trimmed = value.trimStart();
    if (!trimmed.startsWith("/")) return null;
    const space = trimmed.indexOf(" ");
    if (space >= 0) return null;
    return trimmed.slice(1);
  }, [value]);

  const matches: SlashCommand[] = useMemo(() => {
    if (slashPrefix === null) return [];
    return matchSlashCommands(slashPrefix);
  }, [slashPrefix]);

  useEffect(() => {
    if (activeIndex >= matches.length) setActiveIndex(0);
  }, [matches, activeIndex]);

  const submit = async (override?: string) => {
    const content = (override ?? value).trim();
    if (!content || conversation.streaming) return;

    const slash = parseSlashInput(content);
    if (slash) {
      const consumed = await slash.match.run(slash.rawArgs, {
        conversation,
        composer: { setValue, submit },
        attachments: {
          addByKey: async (key: string) => {
            await addAttachment("ticket", key);
          },
        },
      });
      if (consumed) return;
    }

    setValue("");
    try {
      await send(content);
    } catch {
      // ConversationProvider already paints the error into the assistant bubble.
    } finally {
      inputRef.current?.focus();
    }
  };

  const acceptCommand = (cmd: SlashCommand) => {
    setValue(`/${cmd.name}${cmd.args ? " " : ""}`);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + matches.length) % matches.length,
        );
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        acceptCommand(matches[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setValue(value.replace(/^\s*\//, ""));
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const sending = conversation.streaming;
  const disabled = !value.trim() || sending;

  return (
    <div className="border-t border-subtle p-3">
      <div className="relative flex gap-2">
        {matches.length > 0 && (
          <SlashCommandMenu
            commands={matches}
            activeIndex={activeIndex}
            onSelect={acceptCommand}
          />
        )}
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Ask about test cases, edge cases, or strategy. Type / for commands."
          aria-label="Compose a message"
          className="g-input flex-1 resize-none text-[12.5px] min-h-[40px] max-h-[160px]"
        />
        {sending ? (
          <button
            type="button"
            onClick={cancel}
            title="Stop"
            aria-label="Stop"
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-overlay border border-subtle text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Square size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled}
            aria-label="Send"
            className="flex items-center justify-center w-10 h-10 rounded-lg g-btn-solid disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-ink-faint">
        <span>Enter to send · Shift+Enter for newline · / for commands</span>
        <span>{SLASH_COMMANDS.length} commands</span>
      </div>
    </div>
  );
}
