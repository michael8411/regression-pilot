import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Info, AlertTriangle } from "@/lib/icons";
import { getConnectionReadiness } from "./lib/coreConnectionsApi";
import type {
  ConnectionReadiness,
  ProviderReadiness,
  ReadinessState,
} from "@/types/readiness";

const STATE_TONE: Record<ReadinessState, string> = {
  ready: "text-ok",
  partial: "text-warn",
  not_ready: "text-err",
};

const STATE_LABEL: Record<ReadinessState, string> = {
  ready: "Ready",
  partial: "Partial",
  not_ready: "Not ready",
};

const PROVIDER_LABEL: Record<string, string> = {
  jira: "Jira",
  github: "GitHub",
  ado: "Azure DevOps",
  sql_server: "SQL Server",
  zephyr: "Zephyr",
  gemini: "Gemini",
};

export function ConnectionReadinessPanel() {
  const [data, setData] = useState<ConnectionReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getConnectionReadiness()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Could not load readiness");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="text-[11.5px] text-err">Could not load readiness: {error}</div>
    );
  }
  if (!data) {
    return (
      <div className="text-[11.5px] text-ink-muted">Loading readiness…</div>
    );
  }

  const setupPath = data.oauth.usable_for_signin
    ? "HCSS sign-in is set up. You can also use Manual Setup."
    : "Manual Setup is the current working path. These credentials power Live Testing, Regression, and Assistant tools until HCSS sign-in is available.";

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-subtle bg-surface-elevated px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Info size={13} className="text-info" />
          <h4 className="text-[12.5px] font-semibold text-ink">Current setup path</h4>
        </div>
        <p className="text-[11.5px] text-ink-secondary leading-snug">{setupPath}</p>
      </div>

      <OAuthReadinessRow data={data} />

      <ReadinessSection
        title="Live Testing"
        state={data.live_generation.state}
        summary={data.live_generation.summary}
        providers={data.live_generation.providers}
      />

      <ReadinessSection
        title="Regression"
        state={data.regression.state}
        summary={data.regression.summary}
        providers={data.regression.providers}
      />

      <AssistantReadinessSection data={data.assistant_mcp} />
    </section>
  );
}

function OAuthReadinessRow({ data }: { data: ConnectionReadiness }) {
  const oauth = data.oauth;
  const [showDetails, setShowDetails] = useState(false);
  if (oauth.usable_for_signin) {
    return (
      <div className="rounded-lg border border-ok/30 bg-ok/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={13} className="text-ok" />
          <span className="text-[12.5px] text-ok font-semibold">
            HCSS sign-in is set up
          </span>
        </div>
        <p className="text-[11.5px] text-ink-secondary leading-snug mt-1">
          {oauth.message}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-info/30 bg-info/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <Info size={13} className="text-info" />
        <span className="text-[12.5px] text-ink font-semibold">
          HCSS sign-in is not set up yet
        </span>
      </div>
      <p className="text-[11.5px] text-ink-secondary leading-snug mt-1">
        {oauth.message}
      </p>
      {oauth.missing_settings.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-[10.5px] text-ink-muted hover:text-ink"
          >
            {showDetails ? "Hide" : "Show"} app registration values
          </button>
          {showDetails && (
            <ul className="mt-1 pl-4 list-disc text-[10.5px] text-ink-muted">
              {oauth.missing_settings.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ReadinessSection({
  title,
  state,
  summary,
  providers,
}: {
  title: string;
  state: ReadinessState;
  summary: string;
  providers: Record<string, ProviderReadiness>;
}) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-elevated px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h4 className="text-[12.5px] font-semibold text-ink">{title} readiness</h4>
        <span className={`text-[10.5px] font-mono ${STATE_TONE[state]}`}>
          {STATE_LABEL[state]}
        </span>
      </div>
      <p className="text-[11.5px] text-ink-secondary leading-snug mb-2">
        {summary}
      </p>
      <div className="flex flex-col gap-1">
        {Object.entries(providers).map(([key, p]) => (
          <ProviderRow key={key} providerKey={key} provider={p} />
        ))}
      </div>
    </div>
  );
}

function ProviderRow({
  providerKey,
  provider,
}: {
  providerKey: string;
  provider: ProviderReadiness;
}) {
  const label = PROVIDER_LABEL[providerKey] ?? providerKey;
  const dot = provider.usable
    ? "bg-ok"
    : provider.configured
    ? "bg-warn"
    : "bg-ink-faint";
  return (
    <div className="flex items-start gap-2 py-1 text-[11.5px]">
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-ink font-medium">{label}</span>
          <span className="text-[10px] font-mono text-ink-muted">
            {provider.auth_mode}
          </span>
        </div>
        <div className="text-[10.5px] text-ink-muted leading-snug">
          {provider.message}
        </div>
      </div>
    </div>
  );
}

function AssistantReadinessSection({
  data,
}: {
  data: ConnectionReadiness["assistant_mcp"];
}) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-elevated px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h4 className="text-[12.5px] font-semibold text-ink">Assistant tools readiness</h4>
        <span className={`text-[10.5px] font-mono ${STATE_TONE[data.state]}`}>
          {STATE_LABEL[data.state]}
        </span>
      </div>
      <p className="text-[11.5px] text-ink-secondary leading-snug mb-2">
        {data.summary}
      </p>
      <p className="text-[10.5px] text-ink-muted leading-snug mb-2">
        Assistant uses MCP tools. Live Testing and Regression do not require MCP.
      </p>
      <div className="flex flex-col gap-1">
        {Object.entries(data.managed_connections).map(([cid, m]) => (
          <div key={cid} className="flex items-start gap-2 py-1 text-[11.5px]">
            <span
              className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                m.state === "connected" ? "bg-ok" : "bg-ink-faint"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-ink font-medium">
                  {PROVIDER_LABEL[m.provider] ?? m.provider} MCP
                </span>
                <span className="text-[10px] font-mono text-ink-muted">
                  {m.state}
                </span>
              </div>
              <div className="text-[10.5px] text-ink-muted leading-snug">
                {m.message}
              </div>
            </div>
          </div>
        ))}
      </div>
      {data.manual_connections_count > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-ink-muted">
          <ChevronRight size={11} />
          <span>
            {data.manual_connections_count} manual MCP connection
            {data.manual_connections_count === 1 ? "" : "s"} also available
          </span>
        </div>
      )}
      {data.state === "not_ready" && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-warn/20 bg-warn/5 px-2 py-1.5">
          <AlertTriangle size={11} className="text-warn mt-0.5 shrink-0" />
          <span className="text-[10.5px] text-ink-secondary leading-snug">
            Connect a provider (Jira, GitHub, ADO, or SQL Server) or add a manual
            MCP connection below to enable Assistant tools.
          </span>
        </div>
      )}
    </div>
  );
}
