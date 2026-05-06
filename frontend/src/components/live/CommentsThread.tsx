import type { JiraComment } from "@/types";

interface Props {
  comments: JiraComment[];
}

export function CommentsThread({ comments }: Props) {
  return (
    <section className="px-4 py-3 border-b border-subtle">
      <h3 className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold mb-2">
        Comments{" "}
        {comments.length > 0 && (
          <span className="opacity-60">· {comments.length}</span>
        )}
      </h3>
      {comments.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {comments.map((c, i) => (
            <li
              key={`${c.created}-${i}`}
              className="rounded-md border border-subtle bg-surface-elevated px-3 py-2"
            >
              <div className="flex items-center justify-between text-[10.5px] text-ink-faint mb-1">
                <span className="text-ink-secondary font-medium">
                  {c.author}
                </span>
                <span>{relative(c.created)}</span>
              </div>
              <pre className="font-sans text-[11.5px] text-ink-secondary whitespace-pre-wrap leading-relaxed m-0">
                {c.body}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function relative(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}
