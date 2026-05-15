import { useEffect, useState, type KeyboardEvent } from "react";
import { Loader2, Send, ShieldAlert, X } from "@/lib/icons";
import { usePostComment } from "./hooks/usePostComment";
import { useOptionalLiveActivityFeed } from "./activity";

interface Props {
  ticketKey: string;
  onPosted: (c: { author: string; created: string; body: string }) => void;
}

export function CommentComposer({ ticketKey, onPosted }: Props) {
  const { posting, warnings, error, clearWarnings, post } = usePostComment();
  const activity = useOptionalLiveActivityFeed();
  const [body, setBody] = useState("");
  const [showWarn, setShowWarn] = useState(false);

  useEffect(() => {
    if (warnings.length > 0) {
      setShowWarn(true);
      const t = setTimeout(() => setShowWarn(false), 8000);
      return () => clearTimeout(t);
    }
  }, [warnings]);

  const submit = async () => {
    const text = body.trim();
    if (!text || posting) return;
    const res = await post(ticketKey, text);
    if (res) {
      onPosted({
        author: res.comment.author,
        created: res.comment.created,
        body: text,
      });
      if (activity) {
        const truncated =
          text.length > 80 ? `${text.slice(0, 77)}…` : text;
        void activity.record({
          intent: "comment_posted",
          summary: `commented on ${ticketKey}`,
          detail: `"${truncated}"`,
          ticket_key: ticketKey,
        });
      }
      setBody("");
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t border-subtle p-3">
      {showWarn && warnings.length > 0 && (
        <div
          role="alert"
          className="mb-2 flex items-start gap-2 px-2 py-1.5 rounded-md border border-warn/30 bg-warn/[0.06] text-warn text-[11px]"
        >
          <ShieldAlert size={11} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            Comment looked like it contained a credential. It was still posted.
            <span className="block opacity-80 mt-0.5">
              Patterns: {warnings.map((w) => w.pattern_name).join(", ")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowWarn(false);
              clearWarnings();
            }}
            aria-label="Dismiss"
            className="text-warn/70 hover:text-warn"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-2 px-2 py-1.5 rounded-md border border-err/30 bg-err/[0.06] text-err text-[11px]"
        >
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKey}
          placeholder="Write a comment… (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="g-input flex-1 resize-none text-[12px] min-h-[42px] max-h-[120px]"
          aria-label="Comment text"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!body.trim() || posting}
          aria-label="Send comment"
          className="g-btn-solid w-10 h-10 flex items-center justify-center disabled:opacity-30"
        >
          {posting ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Send size={13} />
          )}
        </button>
      </div>
    </div>
  );
}
