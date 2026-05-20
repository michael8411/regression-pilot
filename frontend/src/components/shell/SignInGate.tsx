import { Button } from "@/components/ui";
import { PlugZap, Settings as SettingsIcon } from "@/lib/icons";
import { useIdentity } from "@/hooks/useIdentity";

/**
 * Phase 17 — first-run sign-in path.
 *
 * Renders a full-bleed gate ONLY when no OAuth identity and no manual
 * credentials exist. Returns null otherwise so existing users keep their
 * workspace. The `onOpenSettings` prop lets users open Settings to fall
 * back to manual PAT setup if OAuth isn't yet configured by IT.
 */
export interface SignInGateProps {
  onOpenSettings?: () => void;
}

export function SignInGate({ onOpenSettings }: SignInGateProps) {
  const { status, loading, startSignIn, configMissing } = useIdentity();
  if (loading) return null;

  const hasOAuth = status.signed_in;
  const manual = status.manual_fallbacks || {};
  const hasManual = !!(manual.jira || manual.github || manual.ado);
  if (hasOAuth || hasManual) return null;

  return (
    <div
      role="dialog"
      aria-label="Sign in to Testdeck"
      className="fixed inset-0 z-40 flex items-center justify-center bg-surface/95 backdrop-blur-sm"
    >
      <div className="w-[420px] max-w-[90vw] rounded-lg border border-subtle bg-surface-panel shadow-lg px-6 py-6">
        <h1 className="text-[16px] font-semibold text-ink mb-1">
          Sign in with HCSS
        </h1>
        <p className="text-[12px] text-ink-muted mb-4 leading-relaxed">
          Connect Jira, GitHub, and Azure DevOps in one guided setup.
        </p>

        {configMissing && configMissing.length > 0 && (
          <div
            role="alert"
            className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 mb-3"
          >
            OAuth is not configured yet. Missing: {configMissing.join(", ")}.
            You can still use manual setup below.
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            leading={<PlugZap size={12} />}
            onClick={() => void startSignIn()}
          >
            Sign in with HCSS
          </Button>
          <Button
            variant="ghost"
            leading={<SettingsIcon size={12} />}
            onClick={onOpenSettings}
          >
            Use manual setup
          </Button>
        </div>
      </div>
    </div>
  );
}
