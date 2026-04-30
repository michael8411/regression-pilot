export { AppShell, type AppShellProps } from "./AppShell";
export { Sidebar as ShellSidebar, type SidebarProps as ShellSidebarProps } from "./Sidebar";
export { TopBar, type TopBarProps } from "./TopBar";
export { TitleBar } from "./TitleBar";
export { CommandPalette, type CommandPaletteProps } from "./CommandPalette";
export { coreCommands } from "./commands/coreCommands";
export { useGlobalCommandShortcut } from "./commands/useGlobalCommandShortcut";
export {
  useRegisterCommand,
  useRegisterCommands,
} from "@/contexts/CommandRegistryContext";
