import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import { MessageSquare, Send, Loader2, Sparkles, User } from "lucide-react";
import { streamChatMessage } from "@/lib/api";
import type { ChatMessage, JiraTicket } from "@/types";

interface ChatViewProps {
  tickets: JiraTicket[];
}

export function ChatView({ tickets }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setStreaming(true);

    const assistantMsg: ChatMessage = { role: "assistant", content: "", timestamp: Date.now() };
    setMessages([...updated, assistantMsg]);

    try {
      const apiMsgs = updated.map(m => ({ role: m.role, content: m.content }));
      let full = "";
      for await (const chunk of streamChatMessage(apiMsgs, tickets)) {
        full += chunk;
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: full };
          return copy;
        });
      }
    } catch (err: any) {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: `Error: ${err.message}` };
        return copy;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex-1 flex flex-col p-5 gap-4 overflow-hidden animate-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent/[0.08] border border-accent/[0.12] flex items-center justify-center">
          <MessageSquare size={15} className="text-accent-light" />
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-ink">AI Assistant</h2>
          <p className="text-[10.5px] text-ink-muted">
            {tickets.length > 0 ? `${tickets.length} tickets loaded` : "Chat about test strategy"}
            <span className="text-ink-faint ml-1.5">· Gemini 2.5 Flash</span>
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto glass p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-11 h-11 rounded-2xl bg-accent/[0.06] border border-accent/[0.10] flex items-center justify-center mb-4">
              <Sparkles size={18} className="text-accent-light/40" />
            </div>
            <p className="text-[12.5px] text-ink-muted max-w-xs leading-relaxed">
              Ask about test strategy, request specific test cases, or explore edge cases for your tickets.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-4 justify-center max-w-sm">
              {[
                "What edge cases should I test for pay adjustments?",
                "Generate negative test cases for sync tickets",
                "What preconditions for multi-BU testing?",
              ].map(p => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="text-[10px] text-accent-light/50 px-2.5 py-1.5 rounded-lg bg-accent/[0.04] border border-accent/[0.08] hover:bg-accent/[0.08] transition-colors leading-tight"
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
            className={clsx("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-md bg-accent/[0.10] flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={11} className="text-accent-light" />
              </div>
            )}

            <div className={clsx(
              "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-[1.65]",
              msg.role === "user"
                ? "bg-accent/[0.12] text-ink border border-accent/[0.10] rounded-br-lg"
                : "bg-white/[0.025] text-ink-secondary border border-white/[0.04] rounded-bl-lg"
            )}>
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                <span className="inline-block w-[3px] h-[14px] bg-accent-light/60 ml-0.5 -mb-0.5 animate-pulse-slow rounded-full" />
              )}
            </div>

            {msg.role === "user" && (
              <div className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
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
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about test cases, edge cases, or strategy..."
          rows={1}
          className="g-input flex-1 resize-none text-[12.5px] min-h-[40px] max-h-[100px]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || streaming}
          className="g-btn-solid w-10 h-10 flex items-center justify-center shrink-0 rounded-xl disabled:opacity-25"
        >
          {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
