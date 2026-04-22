export type FeatureFlag =
  | "workspaceSwitcher"
  | "commandPalette"
  | "historyDrawer"
  | "onboardingV2"
  | "assistantV2"
  | "liveTesting"
  | "mcpIntegration"
  | "testCycles"
  | "lightTheme";

const DEFAULTS: Record<FeatureFlag, boolean> = {
  workspaceSwitcher: false,
  commandPalette: false,
  historyDrawer: false,
  onboardingV2: false,
  assistantV2: false,
  liveTesting: false,
  mcpIntegration: false,
  testCycles: false,
  lightTheme: true, // keep the old light theme available while refactoring
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
