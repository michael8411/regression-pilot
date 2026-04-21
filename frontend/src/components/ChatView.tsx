import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import { MessageSquare, Send, Loader2, Sparkles, User } from "lucide-react";
import { streamChatMessage } from "@/lib/api";
import type { ChatMessage, JiraTicket } from "@/types";

interface ChatViewProps {
  tickets: JiraTicket[];
  initialMessages?: ChatMessage[];
  saveStateImmediate: (key: string, value: unknown) => Promise<void>;
}

export function ChatView({ tickets, initialMessages, saveStateImmediate }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!streaming && messages.length > 0) {
      void saveStateImmediate("chatMessages", messages);
    }
  }, [streaming, messages, saveStateImmediate]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setStreaming(true);

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    setMessages([...updated, assistantMsg]);

    try {
      const apiMsgs = updated.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      let full = "";
      for await (const chunk of streamChatMessage(apiMsgs, tickets)) {
        full += chunk;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: full };
          return copy;
        });
      }
    } catch (err: any) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: `Error: ${err.message}`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex overflow-hidden flex-col flex-1 gap-4 p-5 animate-in">
      {/* Header */}
      <div className="flex gap-3 items-center">
        <div className="w-8 h-8 rounded-lg bg-accent-dim border border-accent/[0.15] flex items-center justify-center">
          <MessageSquare size={15} className="text-accent-text" />
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-ink">AI Assistant</h2>
          <p className="text-[10.5px] text-ink-muted">
            {tickets.length > 0
              ? `${tickets.length} tickets loaded`
              : "Chat about test strategy"}
            <span className="text-ink-faint ml-1.5">· Gemini 2.5 Flash</span>
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="overflow-y-auto flex-1 p-4 space-y-3 surface"
      >
        {messages.length === 0 && (
          <div className="flex flex-col justify-center items-center px-6 h-full text-center">
            <div className="w-11 h-11 rounded-[10px] bg-accent-dim border border-accent/[0.12] flex items-center justify-center mb-4">
              <Sparkles size={18} className="text-accent-text/40" />
            </div>
            <p className="text-[12.5px] text-ink-muted max-w-xs leading-relaxed">
              Ask about test strategy, request specific test cases, or explore
              edge cases for your tickets.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-4 justify-center max-w-sm">
              {[
                "What edge cases should I test for pay adjustments?",
                "Generate negative test cases for sync tickets",
                "What preconditions for multi-BU testing?",
              ].map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="text-[10px] text-accent-text/50 px-2.5 py-1.5 rounded-md bg-accent-dim border border-accent/[0.12] hover:bg-accent-glow transition-colors leading-tight"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={clsx(
              "flex gap-2.5",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-md bg-accent-dim flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={11} className="text-accent-text" />
              </div>
            )}

            <div
              className={clsx(
                "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-[1.65]",
                msg.role === "user"
                  ? "bg-accent-dim text-ink border border-accent/[0.15] rounded-br-lg"
                  : "bg-surface-elevated text-ink-secondary border border-subtle rounded-bl-lg",
              )}
            >
              <pre className="font-sans whitespace-pre-wrap">{msg.content}</pre>
              {streaming &&
                i === messages.length - 1 &&
                msg.role === "assistant" && (
                  <span className="inline-block w-[3px] h-[14px] bg-accent-text/60 ml-0.5 -mb-0.5 animate-pulse-slow rounded-full" />
                )}
            </div>

            {msg.role === "user" && (
              <div className="w-6 h-6 rounded-md bg-surface-overlay flex items-center justify-center shrink-0 mt-0.5">
                <User size={11} className="text-ink-muted" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about test cases, edge cases, or strategy..."
          rows={1}
          className="g-input flex-1 resize-none text-[12.5px] min-h-[40px] max-h-[100px]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || streaming}
          className="flex justify-center items-center w-10 h-10 rounded-lg g-btn-solid shrink-0 disabled:opacity-25"
        >
          {streaming ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>
    </div>
  );
}
