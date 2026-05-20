import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  ShieldCheck,
  X,
} from "@/lib/icons";
import { Button, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
  AuthMode,
  CoreServiceId,
  TestResult,
} from "@/types/coreConnections";
import {
  saveAdoCredentials,
  saveGithubCredentials,
  saveJiraCredentials,
  testAdo,
  testGithub,
  testJira,
} from "./lib/coreConnectionsApi";

interface ServiceMeta {
  id: CoreServiceId;
  name: string;
  brand: string;
  color: string;
  recommended: AuthMode;
  tokenPageLabel: string;
  tokenPageUrl: string;
  scopes: string[];
}

const SERVICE_META: Record<CoreServiceId, ServiceMeta> = {
  jira: {
    id: "jira",
    name: "Jira",
    brand: "JIRA",
    color: "#2684FF",
    recommended: "OAuth",
    tokenPageLabel: "Open Atlassian API tokens",
    tokenPageUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    scopes: [
      'Select "Create classic API token"',
      "No additional scopes required — token inherits your account permissions.",
    ],
  },
  github: {
    id: "github",
    name: "GitHub",
    brand: "GH",
    color: "#8B5CF6",
    recommended: "OAuth",
    tokenPageLabel: "Open GitHub Token Settings",
    tokenPageUrl: "https://github.com/settings/tokens",
    scopes: [
      "Required scopes: repo (Read), read:org",
      "Set expiration to at least 30 days for stable connections.",
    ],
  },
  ado: {
    id: "ado",
    name: "Azure DevOps",
    brand: "ADO",
    color: "#0078D4",
    recommended: "PAT",
    tokenPageLabel: "Open Azure DevOps PAT page",
    tokenPageUrl:
      "https://dev.azure.com/_usersSettings/tokens",
    scopes: [
      "Required scopes: Code (Read), Work Items (Read)",
      "Scope to a single org for safety; we read PR diffs only.",
    ],
  },
};

interface Props {
  service: CoreServiceId;
  initial?: {
    jiraBaseUrl?: string;
    jiraEmail?: string;
    adoOrg?: string;
  };
  onClose: () => void;
  onSaved: () => void;
}

export function CoreConnectionDialog({
  service,
  initial,
  onClose,
  onSaved,
}: Props) {
  const meta = SERVICE_META[service];
  const [authMode, setAuthMode] = useState<AuthMode>(meta.recommended);
  const [token, setToken] = useState("");
  const [reveal, setReveal] = useState(false);
  const [jiraUrl, setJiraUrl] = useState(initial?.jiraBaseUrl ?? "");
  const [jiraEmail, setJiraEmail] = useState(initial?.jiraEmail ?? "");
  const [adoOrg, setAdoOrg] = useState(initial?.adoOrg ?? "");
  const [testState, setTestState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; detail: string }
    | { kind: "err"; detail: string }
  >({ kind: "idle" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tested = testState.kind === "ok";
  const canTest = useMemo(() => {
    if (!token) return false;
    if (service === "jira" && (!jiraUrl || !jiraEmail)) return false;
    if (service === "ado" && !adoOrg) return false;
    return true;
  }, [token, service, jiraUrl, jiraEmail, adoOrg]);

  const buildSummary = (res: TestResult): string => {
    if (service === "jira") {
      return res.display_name
        ? `Connected as ${res.display_name}`
        : "Connected";
    }
    if (service === "github") {
      return res.login ? `Connected as ${res.login}` : "Connected";
    }
    if (res.project_count !== undefined) {
      return `Connected · ${res.project_count} projects accessible`;
    }
    return "Connected";
  };

  const persist = async () => {
    if (service === "jira") {
      await saveJiraCredentials({
        jira_base_url: jiraUrl.trim(),
        jira_email: jiraEmail.trim(),
        jira_api_token: token,
      });
    } else if (service === "github") {
      await saveGithubCredentials({ github_access_token: token });
    } else {
      await saveAdoCredentials({
        ado_org: adoOrg.trim(),
        ado_access_token: token,
      });
    }
  };

  const handleTest = async () => {
    setTestState({ kind: "running" });
    try {
      await persist();
      const fn = service === "jira" ? testJira : service === "github" ? testGithub : testAdo;
      const res = await fn();
      if (res.ok) {
        setTestState({ kind: "ok", detail: buildSummary(res) });
      } else {
        setTestState({ kind: "err", detail: res.error ?? "Failed" });
      }
    } catch (e: any) {
      setTestState({ kind: "err", detail: e?.message ?? "Failed" });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // If user didn't test but has filled enough to save, persist anyway.
      await persist();
      onSaved();
    } catch (e: any) {
      setTestState({ kind: "err", detail: e?.message ?? "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const saveDisabled =
    saving || (authMode === "PAT" && (!tested || !token));

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Connect ${meta.name}`}
      onClick={onClose}
      className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(580px, 92vw)", maxHeight: "88vh" }}
        className="flex flex-col overflow-hidden rounded-2xl border border-muted bg-surface-elevated shadow-float"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-subtle">
          <div className="flex items-center gap-2.5">
            <BrandTile color={meta.color} label={meta.brand} size={28} />
            <h2 className="text-[14px] font-semibold text-ink">
              Connect {meta.name}
            </h2>
          </div>
          <IconButton size="sm" icon={<X size={14} />} aria-label="Close" onClick={onClose} />
        </header>

        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-ink-muted mb-2">
            Authentication method
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <AuthCard
              icon={<ShieldCheck size={14} />}
              title="OAuth"
              desc={`Sign in with your ${meta.name} account. No tokens needed.`}
              active={authMode === "OAuth"}
              recommended={meta.recommended === "OAuth"}
              onClick={() => {
                setAuthMode("OAuth");
                setTestState({ kind: "idle" });
              }}
            />
            <AuthCard
              icon={<Key size={14} />}
              title="Personal Access Token"
              desc={`Generate a token from ${meta.name} settings manually.`}
              active={authMode === "PAT"}
              recommended={meta.recommended === "PAT"}
              onClick={() => {
                setAuthMode("PAT");
                setTestState({ kind: "idle" });
              }}
            />
          </div>

          {authMode === "OAuth" && (
            <div>
              <div className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2.5 mb-3 flex items-start gap-2">
                <AlertTriangle size={13} className="text-warn mt-0.5 shrink-0" />
                <span className="text-[11.5px] text-ink-secondary leading-snug">
                  OAuth sign-in is not yet wired up in this build. Use a Personal
                  Access Token to connect today — OAuth will be enabled in a
                  later release.
                </span>
              </div>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled
                leading={<ExternalLink size={14} />}
              >
                Sign in with {meta.name}
              </Button>
              <div className="mt-3 flex items-start gap-2 rounded-md border border-accent/20 bg-accent/5 px-3 py-2">
                <ShieldCheck size={13} className="text-accent-text mt-0.5 shrink-0" />
                <span className="text-[11px] text-ink-secondary leading-snug">
                  You'll be redirected to {meta.name} to authorize Testdeck. We
                  only request read access for the scopes shown after sign-in.
                </span>
              </div>
            </div>
          )}

          {authMode === "PAT" && (
            <div>
              <div className="rounded-md border border-subtle bg-surface-overlay px-3 py-2.5 mb-3">
                <button
                  type="button"
                  onClick={() => openUrl(meta.tokenPageUrl).catch(() => {})}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-accent-text hover:text-accent mb-1"
                >
                  <ExternalLink size={12} />
                  {meta.tokenPageLabel}
                </button>
                {meta.scopes.map((s) => (
                  <div
                    key={s}
                    className="text-[11px] text-ink-muted leading-snug"
                  >
                    · {s}
                  </div>
                ))}
              </div>

              {service === "jira" && (
                <>
                  <Field
                    label="Jira URL"
                    value={jiraUrl}
                    onChange={setJiraUrl}
                    placeholder="https://yoursite.atlassian.net"
                  />
                  <Field
                    label="Email"
                    value={jiraEmail}
                    onChange={setJiraEmail}
                    placeholder="you@company.com"
                  />
                </>
              )}
              {service === "ado" && (
                <Field
                  label="Organization"
                  value={adoOrg}
                  onChange={setAdoOrg}
                  placeholder="your-org"
                />
              )}

              <div className="mb-2">
                <label className="text-[11px] text-ink-muted mb-1 block">
                  Token
                </label>
                <div className="relative">
                  <input
                    type={reveal ? "text" : "password"}
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      if (testState.kind !== "idle")
                        setTestState({ kind: "idle" });
                    }}
                    placeholder="Paste your personal access token"
                    spellCheck={false}
                    autoComplete="off"
                    className="g-input text-[12.5px] pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    aria-label={reveal ? "Hide value" : "Show value"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  leading={<Activity size={12} />}
                  onClick={handleTest}
                  disabled={!canTest || testState.kind === "running"}
                  loading={testState.kind === "running"}
                >
                  Test connection
                </Button>
              </div>

              {testState.kind === "ok" && (
                <div className="mt-3 rounded-md border border-ok/30 bg-ok/10 px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-ok" />
                  <span className="text-[11.5px] text-ok">
                    {testState.detail}
                  </span>
                </div>
              )}
              {testState.kind === "err" && (
                <div className="mt-3 rounded-md border border-err/30 bg-err/10 px-3 py-2 flex items-center gap-2">
                  <AlertTriangle size={13} className="text-err" />
                  <span className="text-[11.5px] text-err">
                    {testState.detail}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-subtle">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saveDisabled}
            loading={saving}
          >
            Save
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function AuthCard({
  icon,
  title,
  desc,
  active,
  recommended,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  active: boolean;
  recommended: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative text-left p-3 rounded-lg transition-colors border",
        active
          ? "bg-accent/10 border-accent"
          : "bg-surface-overlay border-subtle hover:border-muted",
      )}
    >
      {recommended && (
        <span className="absolute top-1.5 right-1.5 rounded-full bg-accent/15 text-accent-text border border-accent/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
          Recommended
        </span>
      )}
      <div className="flex items-center gap-2 mb-1">
        <span className={active ? "text-accent-text" : "text-ink-muted"}>
          {icon}
        </span>
        <span className="text-[12.5px] font-semibold text-ink">{title}</span>
      </div>
      <div className="text-[11px] text-ink-muted leading-snug">{desc}</div>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="mb-2.5">
      <label className="text-[11px] text-ink-muted mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="g-input text-[12.5px] font-mono"
      />
    </div>
  );
}

export function BrandTile({
  color,
  label,
  size = 38,
}: {
  color: string;
  label: string;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.24),
        background: `linear-gradient(135deg, ${color}, ${color}aa)`,
      }}
      className="flex items-center justify-center text-[#06221E] font-mono font-bold shrink-0"
    >
      <span style={{ fontSize: Math.max(9, Math.round(size * 0.28)) }}>
        {label}
      </span>
    </span>
  );
}
