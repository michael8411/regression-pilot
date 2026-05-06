import { Loader2 } from "@/lib/icons";

export function StreamingIndicator() {
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[11.5px] text-ink-muted">
      <Loader2 size={11} className="animate-spin" />
      Assistant is replying…
    </div>
  );
}
