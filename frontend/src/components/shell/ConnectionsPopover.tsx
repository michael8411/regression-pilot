import { useEffect, useRef } from "react";
import { Button, StatusDot } from "@/components/ui";
import {
  AlertCircle,
  CheckCircle2,
  PlugZap,
  Settings as SettingsIcon,
  X,
} from "@/lib/icons";
import type {
  IdentityStatus,
  OAuthProvider,
  ProviderIdentityStatus,
} from "@/types/identity";

const PROVIDER_ROWS: Array<{
  id: OAuthProvider;
  label: string;
  sub: string;
}> = [
  { id: "entra", label: "HCSS / Microsoft", sub: "Identity + Azure DevOps" },
  { id: "atlassian", label: "Jira / Atlassian", sub: "Read & write tickets" },
  { id: "github", label: "GitHub", sub: "Repo + PR context" },
];

export interface ConnectionsPopoverProps {
  status: IdentityStatus;
  onClose: () => void;
  onReconnect: (provider: OAuthProvider) => void;
  onSignOut: () => void;
  onOpenSettings?: () => void;
}

function rowTone(
  provider: OAuthProvider,
  prov: ProviderIdentityStatus,
  manual: IdentityStatus["manual_fallbacks"],
): { tone: "ok" | "warn" | "muted"; label: string } {
  if (prov.connected) return { tone: "ok", label: "Connected" };
  if (prov.needs_reconnect) return { tone: "warn", label: "Needs reconnect" };
  const manualKey =
    provider === "atlassian"
      ? "jira"
      : provider === "entra"
      ? "ado"
      : "github";
  if (manual[manualKey as keyof typeof manual]) {
    return { tone: "warn", label: "Manual fallback" };
  }
  return { tone: "muted", label: "Not connected" };
}

export function ConnectionsPopover({
  status,
  onClose,
  onReconnect,
  onSignOut,
  onOpenSettings,
}: ConnectionsPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Connections"
      className="absolute left-2 top-full z-30 w-[280px] rounded-lg border border-subtle bg-surface-panel shadow-lg p-3"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink truncate">
            {status.profile?.display_name || "Signed in"}
          </div>
          <div className="text-[11px] text-ink-muted truncate">
            {status.profile?.email || ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-muted hover:text-ink"
          aria-label="Close connections"
        >
          <X size={12} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        {PROVIDER_ROWS.map((row) => {
          const prov = status.providers[row.id];
          const { tone, label } = rowTone(
            row.id,
            prov,
            status.manual_fallbacks,
          );
          return (
            <div
              key={row.id}
              className="flex items-center gap-2 rounded-md border border-subtle px-2 py-1.5"
            >
              {tone === "ok" ? (
                <CheckCircle2 size={12} className="text-ok shrink-0" />
              ) : (
                <AlertCircle
                  size={12}
                  className={
                    tone === "warn" ? "text-warn shrink-0" : "text-ink-muted shrink-0"
                  }
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11.5px] text-ink truncate">
                  {row.label}
                </div>
                <div className="text-[10.5px] text-ink-muted truncate">
                  {prov.display || row.sub}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <StatusDot tone={tone} size="sm" />
                <span className="text-[10px] font-mono text-ink-muted">
                  {label}
                </span>
                {(tone === "warn" || tone === "muted") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leading={<PlugZap size={10} />}
                    onClick={() => onReconnect(row.id)}
                  >
                    Reconnect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          leading={<SettingsIcon size={11} />}
          onClick={onOpenSettings}
        >
          Settings
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="danger" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
