import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "@/lib/icons";
import { IconButton } from "@/components/ui";
import { useRoute } from "@/contexts/RouteContext";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { McpConnectionsPanel } from "./McpConnectionsPanel";

/**
 * Temporary full-screen overlay hosting the MCP Connections panel.
 *
 * Phase 11 will mount `<McpConnectionsPanel />` inside its real Settings
 * overlay; until then 9b exposes it via the `["mcpConnections"]` overlay
 * route, gated on the `mcpV2` feature flag.
 */
export function McpConnectionsOverlay() {
  const { route, closeOverlay } = useRoute();
  const open =
    route[0] === "mcpConnections" && isFeatureEnabled("mcpV2");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlay();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, closeOverlay]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connections"
      className="fixed inset-0 z-[7000] bg-surface backdrop-blur-sm flex flex-col animate-fade-in"
    >
      <header className="flex items-center justify-between px-6 py-3 border-b border-subtle bg-surface-elevated">
        <h1 className="text-[14px] font-semibold text-ink">Connections</h1>
        <IconButton
          size="sm"
          aria-label="Close"
          icon={<X size={14} />}
          onClick={closeOverlay}
        />
      </header>
      <div className="flex-1 overflow-y-auto">
        <McpConnectionsPanel />
      </div>
    </div>,
    document.body,
  );
}
