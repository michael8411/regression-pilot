import { clsx } from "clsx";
import { CheckCircle2, AlertCircle, RefreshCw } from "@/lib/icons";
import {
  useAssistantToolCatalog,
  type ManagedProviderStatus,
} from "./hooks/useAssistantToolCatalog";

const PROVIDER_LABELS: Record<string, string> = {
  atlassian: "Jira",
  github: "GitHub",
  ado: "ADO",
  sql_server: "SQL",
};

export function AssistantToolStatusBar({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) {
  const { providers, loading, refresh } = useAssistantToolCatalog();

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-subtle bg-surface"
      aria-label="Managed tool providers"
    >
      <span className="text-[11px] uppercase tracking-wider text-ink-muted">
        Tools
      </span>
      <div className="flex flex-wrap gap-1.5">
        {providers.map((p) => (
          <ProviderPill key={p.connection_id} status={p} onOpenSettings={onOpenSettings} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => void refresh()}
        className="ml-auto text-[11px] text-ink-muted hover:text-ink inline-flex items-center gap-1"
        title="Refresh provider status"
        disabled={loading}
      >
        <RefreshCw size={11} />
        Refresh
      </button>
    </div>
  );
}

function ProviderPill({
  status,
  onOpenSettings,
}: {
  status: ManagedProviderStatus;
  onOpenSettings?: () => void;
}) {
  const label = PROVIDER_LABELS[status.provider] ?? status.provider;
  const connected = status.state === "connected";
  return (
    <button
      type="button"
      onClick={onOpenSettings}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border",
        connected
          ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
          : "border-amber-300/40 bg-amber-500/10 text-amber-200",
      )}
      title={
        connected
          ? `${label} connected — managed read-only tools available`
          : `${label} needs setup`
      }
    >
      {connected ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
      {label}
    </button>
  );
}
