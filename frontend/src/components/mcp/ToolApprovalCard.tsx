import { useEffect, useRef, useState } from "react";
import { Wrench } from "@/lib/icons";
import { Badge, Button, Spinner } from "@/components/ui";
import { useToolApprovals } from "@/components/assistant/hooks/useToolApprovals";
import { useToolInvoker } from "@/components/assistant/hooks/useToolInvoker";
import type { ToolCallPayload } from "@/types/conversations";

interface Props {
  call: ToolCallPayload;
}

export function ToolApprovalCard({ call }: Props) {
  const { deny, isAutoApproved, isConnectionEnabled } = useToolApprovals();
  const { invoke } = useToolInvoker();
  const [busy, setBusy] = useState(false);
  const autoFiredRef = useRef(false);

  const enabled = isConnectionEnabled(call.connection_id);
  const auto =
    enabled && isAutoApproved(call.connection_id, call.tool);

  useEffect(() => {
    if (call.status !== "requested") return;
    if (!auto || autoFiredRef.current) return;
    autoFiredRef.current = true;
    setBusy(true);
    void invoke(call).finally(() => setBusy(false));
  }, [auto, call, invoke]);

  const approve = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await invoke(call);
    } finally {
      setBusy(false);
    }
  };

  const denyCall = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deny(call.request_id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="region"
      aria-label={`Tool approval for ${call.tool}`}
      className="my-2 rounded-lg border border-warn/40 bg-warn/[0.06] p-3"
    >
      <div className="flex items-center gap-2">
        <Wrench size={12} className="text-warn" />
        <Badge tone="warn" size="sm">
          tool request
        </Badge>
        <span className="font-mono text-[12px] text-ink">{call.tool}</span>
        <span className="text-[10.5px] text-ink-faint">
          via <code className="font-mono">{call.connection_id}</code>
        </span>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-[10.5px] uppercase tracking-wide text-ink-faint">
          Input
        </summary>
        <pre className="mt-1 max-h-64 overflow-auto rounded bg-surface px-2 py-1.5 font-mono text-[10.5px] text-ink-secondary whitespace-pre-wrap">
          {JSON.stringify(call.input, null, 2)}
        </pre>
      </details>

      {!enabled && (
        <p className="mt-2 text-[11px] text-err">
          The connection is disabled. Re-enable it in Connections to run this
          tool.
        </p>
      )}

      {auto ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-muted">
          {busy ? <Spinner size={11} /> : null}
          <span>Auto-approved — running…</span>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void approve()}
            disabled={busy || !enabled}
            leading={busy ? <Spinner size={11} /> : undefined}
          >
            Approve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void denyCall()}
            disabled={busy}
          >
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}
