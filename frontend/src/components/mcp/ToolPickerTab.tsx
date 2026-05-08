import { useEffect, useMemo, useState } from "react";
import { Plug } from "@/lib/icons";
import { Spinner, Toggle } from "@/components/ui";
import { useMcpConnections, useMcpTools } from "@/components/mcp";
import { useAttachments } from "@/components/assistant/hooks/useAttachments";
import {
  decodeToolRef,
  encodeToolRef,
} from "@/components/assistant/lib/attachmentUtils";
import { setToolDescription } from "@/components/assistant/hooks/useThreadController";
import { useRoute } from "@/contexts/RouteContext";

export function ToolPickerTab() {
  const { connections } = useMcpConnections();
  const { gotoSettingsPane } = useRoute();
  const enabled = useMemo(
    () => connections.filter((c) => c.enabled),
    [connections],
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  // Pick the first enabled connection by default; reset if it disappears.
  useEffect(() => {
    if (!activeId && enabled.length > 0) {
      setActiveId(enabled[0].id);
    } else if (activeId && !enabled.find((c) => c.id === activeId)) {
      setActiveId(enabled[0]?.id ?? null);
    }
  }, [enabled, activeId]);

  const { tools, loading, error } = useMcpTools(activeId);
  const { attachments, add, remove } = useAttachments();

  // Cache tool descriptions for the controller to enrich the streamed
  // tool catalog without an extra round-trip.
  useEffect(() => {
    if (!activeId) return;
    for (const t of tools) {
      setToolDescription(activeId, t.name, t.description);
    }
  }, [activeId, tools]);

  const attachedRefs = useMemo(() => {
    const set = new Set<string>();
    for (const a of attachments) {
      if (a.kind === "mcp_tool") set.add(a.ref);
    }
    return set;
  }, [attachments]);

  const findAttachmentId = (ref: string): string | null => {
    const target = attachments.find(
      (a) => a.kind === "mcp_tool" && a.ref === ref,
    );
    return target ? target.id : null;
  };

  if (enabled.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
        <Plug size={20} className="text-ink-muted mb-2" />
        <p className="text-[12px] text-ink-muted max-w-[220px] leading-relaxed">
          No enabled MCP connections.
        </p>
        <button
          type="button"
          onClick={() => gotoSettingsPane("connections")}
          className="mt-2 text-[11.5px] text-accent-text hover:underline"
        >
          Manage connections
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap gap-1">
        {enabled.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveId(c.id)}
            className={`rounded-md px-2 py-1 text-[11px] ${
              activeId === c.id
                ? "bg-accent-dim text-accent-text border border-accent/[0.18]"
                : "text-ink-muted hover:bg-surface-overlay"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size={14} />
        </div>
      ) : error ? (
        <div role="alert" className="text-[11.5px] text-err">
          {error}
        </div>
      ) : tools.length === 0 ? (
        <p className="text-[11.5px] text-ink-faint">
          No tools exposed by this server.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tools.map((t) => {
            if (!activeId) return null;
            const ref = encodeToolRef({
              connection_id: activeId,
              tool: t.name,
            });
            const attached = attachedRefs.has(ref);
            return (
              <li
                key={t.name}
                className="flex items-start gap-2 rounded-md p-2 hover:bg-surface-overlay/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[12px] text-ink truncate">
                    {t.name}
                  </div>
                  {t.description && (
                    <div className="text-[10.5px] text-ink-faint truncate">
                      {t.description}
                    </div>
                  )}
                </div>
                <Toggle
                  checked={attached}
                  onChange={async (on) => {
                    if (on) {
                      await add("mcp_tool", ref);
                    } else {
                      const id = findAttachmentId(ref);
                      if (id) await remove(id);
                    }
                  }}
                  aria-label={`Attach ${t.name}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Re-export for convenience so consumers don't need to know the path.
export { decodeToolRef };
