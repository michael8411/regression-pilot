import { ShieldCheck, AlertCircle } from "@/lib/icons";
import {
  useAssistantToolCatalog,
  type ManagedProviderStatus,
} from "./hooks/useAssistantToolCatalog";

const PROVIDER_LABELS: Record<string, string> = {
  atlassian: "Atlassian / Jira",
  github: "GitHub",
  ado: "Azure DevOps",
  sql_server: "SQL Server (read-only)",
};

/**
 * Phase 18 — read-only summary of managed providers. The assistant will
 * still gate every tool call through the existing approval card; this
 * panel just explains what's available without burying the user in raw
 * MCP details.
 */
export function ManagedToolsPanel() {
  const { providers, loading, error } = useAssistantToolCatalog();
  return (
    <div className="px-3 py-3 border-b border-subtle">
      <div className="text-[11.5px] font-medium text-ink mb-1.5">
        Managed tools
      </div>
      <div className="text-[11px] text-ink-muted mb-2 leading-relaxed">
        Testdeck can call these read-only tools after you approve each call.
      </div>
      {loading && (
        <div className="text-[11px] text-ink-muted">Loading…</div>
      )}
      {error && (
        <div className="text-[11px] text-err">Status unavailable.</div>
      )}
      {!loading && !error && providers.length === 0 && (
        <div className="text-[11px] text-ink-muted">
          No managed providers configured.
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {providers.map((p) => (
          <ProviderRow key={p.connection_id} status={p} />
        ))}
      </ul>
    </div>
  );
}

function ProviderRow({ status }: { status: ManagedProviderStatus }) {
  const label = PROVIDER_LABELS[status.provider] ?? status.provider;
  const connected = status.state === "connected";
  return (
    <li className="flex items-center gap-2 text-[11.5px]">
      {connected ? (
        <ShieldCheck size={12} className="text-emerald-300" />
      ) : (
        <AlertCircle size={12} className="text-amber-300" />
      )}
      <span className="text-ink">{label}</span>
      <span className="ml-auto text-[10.5px] text-ink-muted">
        {connected ? "Connected" : "Needs setup"}
      </span>
    </li>
  );
}
