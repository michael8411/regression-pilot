import { clsx } from "clsx";
import { Info, Sparkles, User } from "@/lib/icons";
import { Markdown } from "@/components/assistant/lib/markdown";
import type { Message } from "@/types/conversations";
import { ToolCallMessage } from "./ToolCallMessage";
import { MessageActions } from "./MessageActions";

interface Props {
  message: Message;
  isLastAssistant: boolean;
  streaming: boolean;
  onCopy: (m: Message) => void;
  onRegenerate?: () => void;
}

export function MessageBubble({
  message,
  isLastAssistant,
  streaming,
  onCopy,
  onRegenerate,
}: Props) {
  if (message.role === "tool") {
    return <ToolCallMessage message={message} />;
  }
  if (message.role === "system") {
    return (
      <div className="flex gap-2 items-center px-3 py-1.5 rounded-md bg-surface-overlay text-[11.5px] text-ink-muted">
        <Info size={11} />
        <span className="font-medium uppercase tracking-wide text-[10px]">
          System
        </span>
        <span className="truncate">{message.content}</span>
      </div>
    );
  }

  const isUser = message.role === "user";
  const cursor = streaming && isLastAssistant && !isUser;

  return (
    <div
      className={clsx(
        "group flex gap-2.5",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div className="w-6 h-6 rounded-md bg-accent-dim flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles size={11} className="text-accent-text" />
        </div>
      )}
      <div className="max-w-[78%] flex flex-col gap-1">
        <div
          className={clsx(
            "rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-[1.65]",
            isUser
              ? "bg-accent-dim text-ink border border-accent/[0.15] rounded-br-lg"
              : "bg-surface-elevated text-ink-secondary border border-subtle rounded-bl-lg",
          )}
        >
          {isUser ? (
            <pre className="font-sans whitespace-pre-wrap m-0">
              {message.content}
            </pre>
          ) : (
            <div className="markdown-content">
              <Markdown source={message.content || " "} />
            </div>
          )}
          {cursor && (
            <span className="inline-block w-[3px] h-[14px] bg-accent-text/60 ml-0.5 -mb-0.5 animate-pulse-slow rounded-full" />
          )}
        </div>
        <MessageActions
          message={message}
          onCopy={() => onCopy(message)}
          onRegenerate={isLastAssistant && !isUser ? onRegenerate : undefined}
        />
      </div>
      {isUser && (
        <div className="w-6 h-6 rounded-md bg-surface-overlay flex items-center justify-center shrink-0 mt-0.5">
          <User size={11} className="text-ink-muted" />
        </div>
      )}
    </div>
  );
}
