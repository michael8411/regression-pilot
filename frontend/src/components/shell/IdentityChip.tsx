import { useState } from "react";
import { cn } from "@/lib/cn";
import { ChevronRight, User } from "@/lib/icons";
import { useIdentity } from "@/hooks/useIdentity";
import { ConnectionsPopover } from "./ConnectionsPopover";

function initials(name: string, email: string): string {
  const base = (name || email || "").trim();
  if (!base) return "td";
  const parts = base.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

export interface IdentityChipProps {
  onOpenSettings?: () => void;
}

export function IdentityChip({ onOpenSettings }: IdentityChipProps) {
  const {
    status,
    loading,
    onboarding,
    configMissing,
    startSignIn,
    reconnectProvider,
    signOut,
  } = useIdentity();
  const [open, setOpen] = useState(false);

  const signedIn = status.signed_in && status.profile;
  const profile = status.profile;
  const label = signedIn
    ? profile?.display_name || profile?.email || "Signed in"
    : "Testdeck";
  const sub = signedIn
    ? profile?.email || ""
    : "Sign in with HCSS";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (!signedIn) {
            void startSignIn();
            return;
          }
          setOpen((v) => !v);
        }}
        className={cn(
          "flex w-full items-center gap-2.5 px-2 pb-3 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        )}
        aria-haspopup={signedIn ? "dialog" : undefined}
        aria-expanded={signedIn ? open : undefined}
      >
        <div
          className={cn(
            "flex justify-center items-center w-[30px] h-[30px] rounded-lg shadow-glow-sm",
            signedIn
              ? "bg-gradient-to-br from-accent/80 to-accent text-white"
              : "bg-gradient-to-br from-accent/60 to-accent text-white",
          )}
          aria-hidden
        >
          {signedIn ? (
            <span className="text-[11px] font-semibold tracking-[-0.04em] leading-none">
              {initials(profile?.display_name || "", profile?.email || "")}
            </span>
          ) : (
            <span className="text-[11px] font-mono font-semibold tracking-[-0.06em] leading-none">
              td
            </span>
          )}
        </div>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold text-ink tracking-tight truncate">
            {label}
          </span>
          <span className="block text-[11px] text-ink-muted truncate">
            {loading ? "Loading…" : sub}
          </span>
        </span>
        {signedIn ? (
          <ChevronRight size={13} className="text-ink-muted shrink-0" />
        ) : (
          <User size={13} className="text-ink-muted shrink-0" />
        )}
      </button>

      {onboarding && (
        <div className="px-2 pb-2 text-[10.5px] text-ink-muted">
          Onboarding in progress — complete sign-in in your browser.
        </div>
      )}

      {configMissing && configMissing.length > 0 && (
        <div
          role="alert"
          className="mx-2 mb-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[10.5px] text-amber-200"
        >
          OAuth not configured. Missing: {configMissing.join(", ")}. Manual PAT
          setup is still available in Settings.
        </div>
      )}

      {open && signedIn && (
        <ConnectionsPopover
          status={status}
          onClose={() => setOpen(false)}
          onReconnect={(p) => {
            void reconnectProvider(p);
          }}
          onSignOut={() => {
            void signOut();
            setOpen(false);
          }}
          onOpenSettings={() => {
            onOpenSettings?.();
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
