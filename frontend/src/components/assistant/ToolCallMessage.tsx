import { clsx } from "clsx";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Wrench,
  X,
} from "@/lib/icons";
import type {
  Message,
  ToolCallPayload,
  ToolCallStatus,
} from "@/types/conversations";

function parsePayload(content: string): ToolCallPayload | null {
  try {
    return JSON.parse(content) as ToolCallPayload;
  } catch {
    return null;
  }
}

const TONE: Record<ToolCallStatus, string> = {
  requested: "border-subtle bg-surface-overlay text-ink-muted",
  approved: "border-accent/[0.18] bg-accent-dim text-accent-text",
  running: "border-accent/[0.18] bg-accent-dim text-accent-text",
  done: "border-ok/30 bg-ok/[0.06] text-ok",
  error: "border-err/30 bg-err/[0.06] text-err",
  denied: "border-subtle bg-surface-overlay text-ink-muted",
};

function iconFor(status: ToolCallStatus) {
  if (status === "done") return CheckCircle2;
  if (status === "error") return AlertCircle;
  if (status === "running" || status === "approved") return Loader2;
  if (status === "denied") return X;
  return Wrench;
}

function inputHasContent(input: unknown): boolean {
  if (input === null || input === undefined) return false;
  if (typeof input === "string") return input.length > 0;
  if (Array.isArray(input)) return input.length > 0;
  if (typeof input === "object") return Object.keys(input as object).length > 0;
  return true;
}

export function ToolCallMessage({ message }: { message: Message }) {
  const payload = parsePayload(message.content);
  if (!payload) {
    if (import.meta.env.DEV) {
      console.warn("ToolCallMessage: invalid JSON content", message.id);
    }
    return null;
  }

  const Icon = iconFor(payload.status);
  const meta = (message.meta ?? {}) as Record<string, unknown>;
  const secretWarning = meta.warning === "secret_in_tool_output";

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
          className={
            payload.status === "running" || payload.status === "approved"
              ? "animate-spin"
              : ""
          }
        />
        <span className="font-mono">{payload.tool}</span>
        {payload.connection_id && (
          <span className="text-[10.5px] opacity-70 font-mono">
            via {payload.connection_id}
          </span>
        )}
        <span className="ml-auto uppercase tracking-wide text-[10px] opacity-70">
          {payload.status}
        </span>
      </div>

      {secretWarning && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-md border border-warn/30 bg-warn/[0.06] px-2 py-1 text-[10.5px] text-warn"
        >
          <ShieldAlert size={11} className="mt-0.5 shrink-0" />
          <span>
            Tool output looked like it contained a credential. The output was
            saved as-is; review before using elsewhere.
          </span>
        </div>
      )}

      {inputHasContent(payload.input) && (
        <details className="text-[11px]">
          <summary className="cursor-pointer opacity-80 hover:opacity-100">
            Input
          </summary>
          <pre className="mt-1 p-2 bg-surface rounded font-mono text-[10.5px] whitespace-pre-wrap">
            {JSON.stringify(payload.input, null, 2)}
          </pre>
        </details>
      )}
      {payload.output !== undefined && payload.output !== null && (
        <details className="text-[11px]">
          <summary className="cursor-pointer opacity-80 hover:opacity-100">
            Output
          </summary>
          <pre className="mt-1 p-2 bg-surface rounded font-mono text-[10.5px] whitespace-pre-wrap">
            {JSON.stringify(payload.output, null, 2)}
          </pre>
        </details>
      )}
      {payload.error && (
        <p className="text-[11px] text-err">{payload.error}</p>
      )}
      {typeof payload.duration_ms === "number" && (
        <p className="text-[10px] text-ink-faint font-mono">
          {payload.duration_ms} ms
        </p>
      )}
    </div>
  );
}
