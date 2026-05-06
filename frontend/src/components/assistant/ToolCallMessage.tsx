import { clsx } from "clsx";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Wrench,
} from "@/lib/icons";
import type { Message, ToolCallPayload } from "@/types/conversations";

function parsePayload(content: string): ToolCallPayload | null {
  try {
    return JSON.parse(content) as ToolCallPayload;
  } catch {
    return null;
  }
}

const TONE: Record<ToolCallPayload["status"], string> = {
  requested: "border-subtle bg-surface-overlay text-ink-muted",
  running: "border-accent/[0.18] bg-accent-dim text-accent-text",
  done: "border-ok/30 bg-ok/[0.06] text-ok",
  error: "border-err/30 bg-err/[0.06] text-err",
};

export function ToolCallMessage({ message }: { message: Message }) {
  const payload = parsePayload(message.content);
  if (!payload) {
    if (import.meta.env.DEV) {
      console.warn("ToolCallMessage: invalid JSON content", message.id);
    }
    return null;
  }

  const Icon =
    payload.status === "done"
      ? CheckCircle2
      : payload.status === "error"
        ? AlertCircle
        : payload.status === "running"
          ? Loader2
          : Wrench;

  return (
    <div
      className={clsx(
        "rounded-lg border px-3 py-2 text-[12px] flex flex-col gap-1.5",
        TONE[payload.status],
      )}
      role="group"
      aria-label={`Tool call: ${payload.tool}`}
    >
      <div className="flex items-center gap-2 font-medium">
        <Icon
          size={12}
          className={payload.status === "running" ? "animate-spin" : ""}
        />
        <span className="font-mono">{payload.tool}</span>
        <span className="ml-auto uppercase tracking-wide text-[10px] opacity-70">
          {payload.status}
        </span>
      </div>
      {payload.input && Object.keys(payload.input).length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer opacity-80 hover:opacity-100">
            Input
          </summary>
          <pre className="mt-1 p-2 bg-surface rounded font-mono text-[10.5px] whitespace-pre-wrap">
            {JSON.stringify(payload.input, null, 2)}
          </pre>
        </details>
      )}
      {payload.output && (
        <details className="text-[11px]">
          <summary className="cursor-pointer opacity-80 hover:opacity-100">
            Output
          </summary>
          <pre className="mt-1 p-2 bg-surface rounded font-mono text-[10.5px] whitespace-pre-wrap">
            {JSON.stringify(payload.output, null, 2)}
          </pre>
        </details>
      )}
      {payload.error && <p className="text-[11px] text-err">{payload.error}</p>}
    </div>
  );
}
