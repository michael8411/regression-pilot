import {
  ClipboardList,
  Database,
  History,
  Info,
  Kanban,
  Key,
  Keyboard,
  Layers,
  MessageSquare,
  Plug,
  Settings as SettingsIcon,
  SlidersHorizontal,
} from "@/lib/icons";
import { isFeatureEnabled } from "@/lib/featureFlags";
import type { CommandItem } from "@/contexts/CommandRegistryContext";

/**
 * Always-on commands owned by the shell: workspace jumps, overlays, help.
 *
 * Route-based jumps carry `action.type === "goto"` — the palette reads
 * the route and calls `useRoute().goto`, so no handler is needed here.
 */
export function coreCommands(args: {
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenSetup: () => void;
  onOpenSettingsPane: (pane: string) => void;
  onAddMcpConnection: () => void;
}): CommandItem[] {
  const settingsEnabled = isFeatureEnabled("settingsV2");
  const mcpEnabled = isFeatureEnabled("mcpV2");
  return [
    {
      id: "jump.regression",
      group: "jump",
      label: "Regression Home",
      sub: "workspace",
      icon: ClipboardList,
      kbd: "G R",
      action: { type: "goto", route: ["regression", "home"] },
    },
    {
      id: "jump.live",
      group: "jump",
      label: "Live Testing Boards",
      sub: "workspace",
      icon: Kanban,
      kbd: "G L",
      action: { type: "goto", route: ["live", "home"] },
    },
    {
      id: "jump.assistant",
      group: "jump",
      label: "Assistant",
      sub: "workspace",
      icon: MessageSquare,
      kbd: "G A",
      action: { type: "goto", route: ["assistant", "home"] },
    },
    {
      id: "jump.cycles",
      group: "jump",
      label: "Test Cycles",
      sub: "workspace",
      icon: Layers,
      action: { type: "goto", route: ["regression", "cycles"] },
    },
    {
      id: "jump.settings",
      group: "jump",
      label: "Settings",
      sub: "modal",
      icon: SettingsIcon,
      kbd: ",",
      action: { type: "run", run: args.onOpenSettings },
    },
    {
      id: "jump.history",
      group: "jump",
      label: "History",
      sub: "drawer",
      icon: History,
      kbd: "G H",
      action: { type: "run", run: args.onOpenHistory },
    },
    {
      id: "action.run-setup",
      group: "action",
      label: "Run setup wizard",
      sub: "modal",
      icon: SettingsIcon,
      keywords: ["onboarding", "configure", "first run", "setup"],
      action: { type: "run", run: args.onOpenSetup },
    },
    ...(settingsEnabled
      ? ([
          {
            id: "settings.credentials",
            group: "jump",
            label: "Settings: Credentials",
            sub: "modal",
            icon: Key,
            keywords: ["jira", "gemini", "zephyr", "tokens", "credentials"],
            action: { type: "run", run: () => args.onOpenSettingsPane("credentials") },
          },
          {
            id: "settings.preferences",
            group: "jump",
            label: "Settings: Preferences",
            sub: "modal",
            icon: SlidersHorizontal,
            keywords: ["theme", "preferences", "defaults"],
            action: { type: "run", run: () => args.onOpenSettingsPane("preferences") },
          },
          {
            id: "settings.connections",
            group: "jump",
            label: "Settings: Connections",
            sub: "modal",
            icon: Plug,
            keywords: ["mcp", "connections", "tools", "integrations"],
            action: { type: "run", run: () => args.onOpenSettingsPane("connections") },
          },
          {
            id: "settings.data-privacy",
            group: "jump",
            label: "Settings: Data & privacy",
            sub: "modal",
            icon: Database,
            keywords: ["export", "wipe", "data", "privacy"],
            action: { type: "run", run: () => args.onOpenSettingsPane("data-privacy") },
          },
          {
            id: "settings.shortcuts",
            group: "jump",
            label: "Settings: Shortcuts",
            sub: "modal",
            icon: Keyboard,
            keywords: ["shortcuts", "keyboard", "keys"],
            action: { type: "run", run: () => args.onOpenSettingsPane("shortcuts") },
          },
          {
            id: "settings.about",
            group: "jump",
            label: "Settings: About",
            sub: "modal",
            icon: Info,
            keywords: ["about", "version", "build"],
            action: { type: "run", run: () => args.onOpenSettingsPane("about") },
          },
        ] satisfies CommandItem[])
      : []),
    ...(mcpEnabled
      ? ([
          {
            id: "mcp.add-connection",
            group: "action",
            label: "MCP: Add connection",
            sub: "MCP",
            icon: Plug,
            keywords: ["mcp", "add", "new", "connection"],
            action: { type: "run", run: args.onAddMcpConnection },
          },
        ] satisfies CommandItem[])
      : []),
    {
      id: "help.shortcuts",
      group: "help",
      label: "Keyboard shortcuts",
      sub: "help",
      icon: Keyboard,
      keywords: ["cheatsheet", "keys"],
      action: {
        type: "run",
        run: () =>
          settingsEnabled
            ? args.onOpenSettingsPane("shortcuts")
            : args.onOpenSettings(),
      },
    },
  ];
}
