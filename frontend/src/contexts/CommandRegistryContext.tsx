/**
 * Command registry — the data layer behind the Mod+K palette.
 *
 * Every screen can contribute commands via `useRegisterCommand`. The
 * palette reads the full list, filters by query, and executes the
 * selected command's action. Routes flow through `useRoute().goto`;
 * free-form side effects run as `action.run()`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Route } from "@/types/routing";
import type { IconComponent } from "@/lib/icons";

export type CommandGroup =
  | "jump"
  | "action"
  | "ai"
  | "recent"
  | "help";

export interface CommandItem {
  /** Stable unique id — e.g. `"jump.regression.home"`, `"action.push"`. */
  id: string;
  group: CommandGroup;
  label: string;
  /** Secondary text — "workspace", "modal", "3d ago". */
  sub?: string;
  icon: IconComponent;
  /** Display hint, e.g. `"G R"`, `"Mod K"` (space-separated for KbdPill). */
  kbd?: string;
  /** Extra terms for search. Not displayed. */
  keywords?: string[];
  action:
    | { type: "goto"; route: Route }
    | { type: "run"; run: () => void | Promise<void> };
  /** Render with the purple AI accent. */
  ai?: boolean;
  /** Static toggle — if false, the item is hidden. */
  enabled?: boolean;
  /** Dynamic predicate evaluated each palette open. */
  when?: () => boolean;
}

interface CommandRegistryValue {
  commands: CommandItem[];
  register: (cmd: CommandItem) => () => void;
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

const CommandRegistryContext = createContext<CommandRegistryValue | null>(null);

export function CommandRegistryProvider({ children }: { children: ReactNode }) {
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [open, setOpen] = useState(false);

  const register = useCallback((cmd: CommandItem) => {
    setCommands((prev) => {
      const next = prev.filter((c) => c.id !== cmd.id);
      next.push(cmd);
      return next;
    });
    return () => {
      setCommands((prev) => prev.filter((c) => c.id !== cmd.id));
    };
  }, []);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  const value = useMemo<CommandRegistryValue>(
    () => ({ commands, register, open, openPalette, closePalette }),
    [commands, register, open, openPalette, closePalette],
  );

  return (
    <CommandRegistryContext.Provider value={value}>
      {children}
    </CommandRegistryContext.Provider>
  );
}

export function useCommandRegistry(): CommandRegistryValue {
  const ctx = useContext(CommandRegistryContext);
  if (!ctx) {
    throw new Error(
      "useCommandRegistry must be used inside <CommandRegistryProvider>",
    );
  }
  return ctx;
}

/**
 * Register a single command for as long as the component is mounted.
 * Pass `null` / `false` to skip (handy for conditional commands).
 *
 * The command object should be memoized if it closes over props —
 * otherwise it re-registers every render. The registry dedupes by id
 * so this is cheap, but a fresh closure is still created each time.
 */
export function useRegisterCommand(cmd: CommandItem | null | false): void {
  const { register } = useCommandRegistry();
  useEffect(() => {
    if (!cmd) return;
    return register(cmd);
  }, [cmd, register]);
}

/**
 * Register a batch of commands. Use this when the set of commands
 * is known statically (e.g. the shell's core commands). Loop-calling
 * `useRegisterCommand` would violate Rules of Hooks if the array
 * length ever changed.
 */
export function useRegisterCommands(cmds: CommandItem[]): void {
  const { register } = useCommandRegistry();
  useEffect(() => {
    const unregs = cmds.map((c) => register(c));
    return () => unregs.forEach((u) => u());
  }, [cmds, register]);
}
