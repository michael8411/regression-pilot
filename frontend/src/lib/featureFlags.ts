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
  // Live Testing redesign rollout — DEFAULT ON.
  //
  // Phase 08 re-run (post Phase 06b) cleared every Go/No-Go gate:
  //   A) frontend build clean (1943 modules, 0 TS errors)
  //   B–D) route smoke / builder / card analytics verified via code audit
  //        against the locked visual contract (00b).
  //   E) drawer + AI + publish: default Jira Test Cases field write (06c)
  //      and legacy linked Zephyr publish both set
  //      appears_on_jira_ticket: true; comment fallback returns false;
  //      duplicate 409 gated by confirm_duplicate; partial publish
  //      renders created + failed separately; PublishResultPanel never
  //      claims "appears on ticket" without a confirmed Jira-side write.
  //   F) targeted backend suites: 104 Phase-08 tests pass; full suite
  //      500/500.
  //   G) encrypted-at-rest assertions cover every sensitive column
  //      including Phase 06b export_metadata for both targets.
  //   H) CRUD round-trips proven for boards, profile, view_prefs,
  //      pins, generated cases, publish (linked + comment), activity.
  //   Hardening checklist: localStorage-free workflow store, Esc +
  //   body-scroll handled in TicketDrawer / BoardBuilderDialog /
  //   PublishCasesDialog (Esc blocked during publishing), polling
  //   pauses during DnD + drawer open, activity logging failures
  //   are swallowed so they never block Jira actions.
  //
  // To opt out locally: `window.__ff.disable("liveTestingRedesignV1")`
  // or VITE_FF_LIVE_TESTING_REDESIGN_V1=false.
  liveTestingRedesignV1: true,
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
