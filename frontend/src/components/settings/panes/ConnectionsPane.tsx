import { useMemo, useState } from "react";
import {
  Lock,
  PlugZap,
} from "@/lib/icons";
import { Badge, Button, StatusDot } from "@/components/ui";
import { McpConnectionsPanel } from "@/components/mcp";
import { SettingsPaneHeader } from "../SettingsPaneHeader";
import { BrandTile, CoreConnectionDialog } from "../CoreConnectionDialog";
import { useCoreConnections } from "../hooks/useCoreConnections";
import type { CoreServiceId } from "@/types/coreConnections";

interface CoreServiceDef {
  id: CoreServiceId;
  name: string;
  brand: string;
  color: string;
  desc: string;
}

const CORE_SERVICES: CoreServiceDef[] = [
  {
    id: "jira",
    name: "Jira",
    brand: "JIRA",
    color: "#2684FF",
    desc: "Read tickets, comments, descriptions",
  },
  {
    id: "github",
    name: "GitHub",
    brand: "GH",
    color: "#8B5CF6",
    desc: "Mobile team — PR diffs and code context",
  },
  {
    id: "ado",
    name: "Azure DevOps",
    brand: "ADO",
    color: "#0078D4",
    desc: "Desktop team — PR diffs and code context",
  },
];

const LOCKED_SERVICES = [
  {
    id: "zephyr",
    name: "Zephyr Scale",
    brand: "Z",
    color: "#22C55E",
    sub: "Auto-configured · /Regression",
  },
  {
    id: "gemini",
    name: "Gemini AI",
    brand: "G",
    color: "#A78BFA",
    sub: "Auto-configured · Gemini 2.5 Pro · Temp 0.3",
  },
];

export function ConnectionsPane() {
  const { status, loading, refresh, disconnect } = useCoreConnections();
  const [openDialog, setOpenDialog] = useState<CoreServiceId | null>(null);

  const summaries = useMemo(() => {
    return {
      jira: status.jira.configured
        ? [status.jira.base_url, status.jira.email]
            .filter(Boolean)
            .join(" · ")
        : null,
      github: status.github.configured ? "Connected" : null,
      ado: status.ado.configured
        ? `${status.ado.org ?? ""}`.trim() || "Connected"
        : null,
    };
  }, [status]);

  return (
    <div className="flex flex-col h-full">
      <SettingsPaneHeader
        title="Connections"
        subtitle="Connect Testdeck to the services it needs to read tickets, code, and write back test cases."
      />
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        {/* Core integrations */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-[13.5px] font-semibold text-ink">
            Core integrations
          </h3>
          <Badge tone="accent" size="sm">
            REQUIRED
          </Badge>
        </div>
        <p className="text-[11.5px] text-ink-muted max-w-[640px] mb-4">
          Required connections for test case generation. These power Live Testing,
          Regression, and the AI Assistant.
        </p>

        {CORE_SERVICES.map((s) => {
          const configured =
            (s.id === "jira" && status.jira.configured) ||
            (s.id === "github" && status.github.configured) ||
            (s.id === "ado" && status.ado.configured);
          return (
            <div
              key={s.id}
              className="rounded-lg border border-subtle bg-surface-elevated px-4 py-3 mb-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <BrandTile color={s.color} label={s.brand} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13.5px] font-semibold text-ink">
                        {s.name}
                      </span>
                      {configured ? (
                        <>
                          <StatusDot tone="ok" size="sm" />
                          <span className="text-[10.5px] font-mono text-ok">
                            Connected
                          </span>
                          <Badge size="sm" tone="neutral">
                            {s.id === "ado" ? "PAT" : "OAUTH"}
                          </Badge>
                        </>
                      ) : (
                        <>
                          <StatusDot tone="muted" size="sm" />
                          <span className="text-[10.5px] font-mono text-ink-muted">
                            Not connected
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-ink-muted truncate">
                      {configured ? summaries[s.id] || s.desc : s.desc}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {configured ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpenDialog(s.id)}
                      >
                        Reconfigure
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void disconnect(s.id)}
                        disabled={loading}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      leading={<PlugZap size={12} />}
                      onClick={() => setOpenDialog(s.id)}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Locked / managed services */}
        {LOCKED_SERVICES.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-subtle bg-surface-panel px-4 py-3 mb-2.5 opacity-70"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <BrandTile color={s.color} label={s.brand} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13.5px] font-semibold text-ink-secondary">
                      {s.name}
                    </span>
                    <StatusDot tone="ok" size="sm" />
                    <span className="text-[10.5px] font-mono text-ink-muted">
                      Auto-configured
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-ink-muted">
                    {s.sub}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-overlay px-2.5 py-1 text-ink-muted">
                <Lock size={11} />
                <span className="text-[10.5px] font-mono">
                  Managed by Testdeck
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Custom MCP servers */}
        <div className="mt-8">
          <McpConnectionsPanel />
        </div>
      </div>

      {openDialog && (
        <CoreConnectionDialog
          service={openDialog}
          initial={{
            jiraBaseUrl: status.jira.base_url ?? "",
            jiraEmail: status.jira.email ?? "",
            adoOrg: status.ado.org ?? "",
          }}
          onClose={() => setOpenDialog(null)}
          onSaved={() => {
            setOpenDialog(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
