export type FeatureFlag =
  | "workspaceSwitcher"
  | "commandPalette"
  | "regressionV2"
  | "historyDrawer"
  | "onboardingV2"
  | "assistantV2"
  | "liveTestingV2"
  | "mcpV2"
  | "testCycles"
  | "settingsV2"
  | "lightTheme"
  | "liveTestingRedesignV1"
  | "mcpSmartRoutingV1"
  | "mcpContextBundleV1"
  | "mcpTransportHttpV1"
  | "mcpTransportSseV1"
  | "assistantPolicyRoutingV1"
  | "oauthSignIn"
  | "repoMappingFallback";

const DEFAULTS: Record<FeatureFlag, boolean> = {
  workspaceSwitcher: true,
  commandPalette: true,
  regressionV2: true,
  historyDrawer: true,
  onboardingV2: true,
  assistantV2: true,
  liveTestingV2: true,
  mcpV2: true,
  testCycles: true,
  settingsV2: true,
  lightTheme: true, // keep the old light theme available while refactoring
  // Live Testing redesign rollout — DEFAULT ON (see Phase 08 sign-off).
  liveTestingRedesignV1: true,
  // MCP refactor Phase 4 rollout flags. Smart routing + the routed bundle
  // are on by default; HTTP transport is opt-in until QA signs off; SSE is
  // off until the implementation lands.
  mcpSmartRoutingV1: true,
  mcpContextBundleV1: true,
  mcpTransportHttpV1: true,
  mcpTransportSseV1: false,
  assistantPolicyRoutingV1: true,
  // Phase 17 HCSS sign-in UX. Off by default until OAuth app
  // registrations (Entra/GitHub/Atlassian client IDs + redirect URIs) are
  // available. Flip via VITE_FF_OAUTH_SIGN_IN=true or
  // `window.__ff.enable("oauthSignIn")` in dev.
  oauthSignIn: false,
  // Jira linked PRs are now the primary repo discovery path. Keep manual repo
  // mapping available as an opt-in fallback while testing edge cases.
  repoMappingFallback: false,
};

/**
 * Lookup order: Vite env → localStorage → defaults
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const envKey = `VITE_FF_${flag.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}`;
  const envVal = (import.meta.env as Record<string, string | undefined>)[envKey];
  if (envVal === "true") return true;
  if (envVal === "false") return false;

  try {
    const lsVal = localStorage.getItem(`ff.${flag}`);
    if (lsVal === "true") return true;
    if (lsVal === "false") return false;
  } catch {
    // localStorage unavailable — fall through
  }

  return DEFAULTS[flag];
}

declare global {
  interface Window {
    __ff?: {
      enable: (flag: FeatureFlag) => void;
      disable: (flag: FeatureFlag) => void;
      list: () => Record<FeatureFlag, boolean>;
    };
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__ff = {
    enable: (flag) => {
      localStorage.setItem(`ff.${flag}`, "true");
      console.info(`[ff] enabled ${flag}`);
    },
    disable: (flag) => {
      localStorage.setItem(`ff.${flag}`, "false");
      console.info(`[ff] disabled ${flag}`);
    },
    list: () => {
      const flags = Object.keys(DEFAULTS) as FeatureFlag[];
      return flags.reduce(
        (acc, f) => ({ ...acc, [f]: isFeatureEnabled(f) }),
        {} as Record<FeatureFlag, boolean>,
      );
    },
  };
}
