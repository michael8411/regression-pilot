/**
 * Single source of truth for keyboard shortcut documentation.
 *
 * Phase 11 ShortcutsPane renders these rows. Future palette / sidebar
 * surfaces can also consume the same list.
 */

export type ShortcutGroup =
  | "Global"
  | "Navigation"
  | "Regression"
  | "Live"
  | "Assistant"
  | "Settings";

export interface ShortcutEntry {
  group: ShortcutGroup;
  /** Keys are rendered as `<Kbd>` pills in order. Use "Mod" for cmd/ctrl. */
  keys: string[];
  label: string;
}

export const SHORTCUTS: readonly ShortcutEntry[] = [
  // Global
  { group: "Global",      keys: ["Mod", "K"], label: "Open command palette" },
  { group: "Global",      keys: ["Mod", ","], label: "Open settings" },

  // Navigation (chord shortcuts wired by Phase 2 / Sidebar)
  { group: "Navigation",  keys: ["G", "R"],   label: "Go to Regression" },
  { group: "Navigation",  keys: ["G", "L"],   label: "Go to Live Testing" },
  { group: "Navigation",  keys: ["G", "A"],   label: "Go to Assistant" },
  { group: "Navigation",  keys: ["G", "H"],   label: "Open History drawer" },

  // Regression
  { group: "Regression",  keys: ["Enter"],    label: "Continue from selected tickets" },

  // Live
  { group: "Live",        keys: ["R"],        label: "Refresh active board" },

  // Assistant
  { group: "Assistant",   keys: ["/"],        label: "Open slash command menu" },
  { group: "Assistant",   keys: ["Enter"],    label: "Send message" },
  { group: "Assistant",   keys: ["Shift", "Enter"], label: "New line in composer" },

  // Settings
  { group: "Settings",    keys: ["Esc"],      label: "Close overlay" },
];

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  "Global",
  "Navigation",
  "Regression",
  "Live",
  "Assistant",
  "Settings",
];
