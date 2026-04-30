import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useCommandRegistry } from "@/contexts/CommandRegistryContext";

/**
 * Binds Mod+K globally — works inside inputs and textareas too.
 * Toggles: open when closed, close when open.
 */
export function useGlobalCommandShortcut(): void {
  const { open, openPalette, closePalette } = useCommandRegistry();
  useKeyboardShortcut(
    "Mod+K",
    () => {
      if (open) closePalette();
      else openPalette();
    },
    { allowInInputs: true },
  );
}
