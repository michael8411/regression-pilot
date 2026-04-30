import {
  ClipboardList,
  History,
  Kanban,
  Keyboard,
  Layers,
  MessageSquare,
  Settings as SettingsIcon,
} from "@/lib/icons";
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
}): CommandItem[] {
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
      id: "help.shortcuts",
      group: "help",
      label: "Keyboard shortcuts",
      sub: "help",
      icon: Keyboard,
      keywords: ["cheatsheet", "keys"],
      // Phase 11 swaps this with a shortcuts panel opener.
      action: { type: "run", run: args.onOpenSettings },
    },
  ];
}
