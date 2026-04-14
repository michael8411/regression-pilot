import { useState, useEffect } from "react";
import { Shield, Check, AlertCircle, RefreshCw } from "lucide-react";
import { getConfigStatus } from "@/lib/api";
import type { ConfigStatus } from "@/types";

interface SetupViewProps {
  onStatusResolved: (status: ConfigStatus) => void;
}

export function SetupView({ onStatusResolved }: SetupViewProps) {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await getConfigStatus();
      setConfig(status);
      onStatusResolved(status);
    } catch {
      setError("Cannot reach backend. Is it running on port 8000?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConfig();
  }, []);

  return (
    <div className="flex flex-1 justify-center items-center p-8">
      <div className="p-7 w-full max-w-md glass animate-in">
        {/* Header */}
        <div className="flex gap-3 items-center mb-7">
          <div className="w-10 h-10 rounded-xl bg-accent/[0.08] border border-accent/[0.12] flex items-center justify-center">
            <Shield size={18} className="text-accent-light" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Configuration</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Edit{" "}
              <code className="font-mono text-accent-light/70 bg-accent/[0.08] px-1 py-0.5 rounded text-[10px]">
                backend/.env
              </code>{" "}
              and restart
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-err/[0.08] border border-err/20 flex items-start gap-2.5">
            <AlertCircle size={15} className="text-err mt-0.5 shrink-0" />
            <p className="text-[12px] text-err/80 leading-relaxed">{error}</p>
          </div>
        )}

        {/* Services */}
        <div className="mb-6 space-y-2">
          <ServiceRow
            label="Jira REST API"
            sublabel={config?.jira.base_url || "Not configured"}
            ok={config?.jira.configured ?? false}
            loading={loading}
          />
          <ServiceRow
            label="Google Gemini"
            sublabel="gemini-2.5-flash"
            ok={config?.ai.configured ?? false}
            loading={loading}
          />
          <ServiceRow
            label="Zephyr Scale"
            sublabel="Test case push"
            ok={config?.zephyr.configured ?? false}
            loading={loading}
            optional
          />
        </div>

        {/* Info */}
        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-5">
          <p className="text-[11px] text-ink-muted leading-[1.6]">
            Your tokens are stored locally on this machine and never leave it.
            The backend connects directly to Jira, Gemini, and Zephyr Scale
            APIs.
          </p>
        </div>

        <button
          onClick={checkConfig}
          className="g-btn-solid w-full py-2.5 text-[13px] flex items-center justify-center gap-2"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh Status
        </button>
      </div>
    </div>
  );
}

function ServiceRow({
  label,
  sublabel,
  ok,
  loading,
  optional,
}: {
  label: string;
  sublabel: string;
  ok: boolean;
  loading: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.015] border border-white/[0.04] transition-colors hover:bg-white/[0.025]">
      <div className="min-w-0">
        <p className="text-[12.5px] text-ink font-medium flex items-center gap-1.5">
          {label}
          {optional && (
            <span className="text-[9px] text-ink-faint bg-white/[0.04] px-1.5 py-0.5 rounded font-normal">
              optional
            </span>
          )}
        </p>
        <p className="text-[10px] text-ink-muted mt-0.5 font-mono truncate">
          {sublabel}
        </p>
      </div>
      {loading ? (
        <div className="w-5 h-5 rounded-full border-[1.5px] border-ink-faint border-t-accent animate-spin shrink-0" />
      ) : ok ? (
        <div className="w-5 h-5 rounded-full bg-ok/[0.12] flex items-center justify-center shrink-0">
          <Check size={11} strokeWidth={3} className="text-ok" />
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full bg-err/[0.12] flex items-center justify-center shrink-0">
          <AlertCircle size={11} className="text-err/70" />
        </div>
      )}
    </div>
  );
}
