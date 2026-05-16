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
  | "liveTestingRedesignV1";

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
  // Live Testing redesign rollout. Phase 08 verification matrix (A–H)
  // passed: build green, 474 backend tests pass, encrypted-at-rest
  // assertions cover all sensitive columns, full CRUD round-trips, and
  // the bug-hardening checklist (Esc + body-scroll + DnD/drawer
  // poll pause + localStorage-free workflow store) is satisfied.
  //
  // The flag stays default-off until Phase 06b ships the publish-to-Jira
  // path (matrix items E5 and H6). Local/dev should opt in via either
  //   VITE_FF_LIVE_TESTING_REDESIGN_V1=true
  // or `window.__ff.enable("liveTestingRedesignV1")` to exercise the
  // redesigned surfaces.
  liveTestingRedesignV1: false,
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
