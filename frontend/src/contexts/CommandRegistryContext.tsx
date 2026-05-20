/**
 * Command registry — the data layer behind the Mod+K palette.
 *
 * Split into two contexts to prevent an infinite-update loop:
 *
 *   WriteCtx  — carries only `register`. It never changes after mount, so
 *               `useRegisterCommand` callers don't re-render when the command
 *               list changes (which would re-create the commands they just
 *               registered, firing the effect again, ad infinitum).
 *
 *   ReadCtx   — carries `commands`, `open`, `openPalette`, `closePalette`.
 *               Only the palette and the global shortcut hook subscribe here.
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

// ── Write context (stable) ─────────────────────────────────────────────────
interface WriteValue {
  register: (cmd: CommandItem) => () => void;
}
const WriteCtx = createContext<WriteValue | null>(null);

// ── Read context (changes with commands / open state) ──────────────────────
interface ReadValue {
  commands: CommandItem[];
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
}
const ReadCtx = createContext<ReadValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────
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

  const writeValue = useMemo<WriteValue>(() => ({ register }), [register]);
  const readValue = useMemo<ReadValue>(
    () => ({ commands, open, openPalette, closePalette }),
    [commands, open, openPalette, closePalette],
  );

  return (
    <WriteCtx.Provider value={writeValue}>
      <ReadCtx.Provider value={readValue}>{children}</ReadCtx.Provider>
    </WriteCtx.Provider>
  );
}

// ── Public hooks ───────────────────────────────────────────────────────────

/**
 * Full registry access — commands list + open state + palette controls.
 * Use this only in the palette and the global shortcut hook.
 */
export function useCommandRegistry(): WriteValue & ReadValue {
  const write = useContext(WriteCtx);
  const read = useContext(ReadCtx);
  if (!write || !read) {
    throw new Error("useCommandRegistry must be used inside <CommandRegistryProvider>");
  }
  return useMemo(() => ({ ...read, register: write.register }), [read, write.register]);
}

/**
 * Register a single command for as long as the component is mounted.
 * Pass `null` / `false` to skip (handy for conditional commands).
 *
 * Uses only the stable WriteCtx so this hook does NOT re-run when the
 * command list changes — preventing infinite-update loops.
 *
 * The command object should be memoized (useMemo) if it closes over props.
 */
export function useRegisterCommand(cmd: CommandItem | null | false): void {
  const write = useContext(WriteCtx);
  if (!write) {
    throw new Error("useRegisterCommand must be used inside <CommandRegistryProvider>");
  }
  const { register } = write;
  useEffect(() => {
    if (!cmd) return;
    return register(cmd);
  }, [cmd, register]);
}

/**
 * Register a batch of commands. Use this when the set of commands
 * is known statically (e.g. the shell's core commands).
 *
 * Uses only the stable WriteCtx — same reasoning as useRegisterCommand.
 */
export function useRegisterCommands(cmds: CommandItem[]): void {
  const write = useContext(WriteCtx);
  if (!write) {
    throw new Error("useRegisterCommands must be used inside <CommandRegistryProvider>");
  }
  const { register } = write;
  useEffect(() => {
    const unregs = cmds.map((c) => register(c));
    return () => unregs.forEach((u) => u());
  }, [cmds, register]);
}
