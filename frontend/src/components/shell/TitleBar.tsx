/**
 * Decides how the top of the window is rendered.
 *
 * Phase 2 ships with native Tauri decorations — this component renders
 * nothing. If a later phase chooses to hide native decorations, flip
 * TITLE_BAR_MODE to "custom" and implement the 16px peek + window
 * controls here. See plans/UIOverhaul/phase-2-app-shell.md §3.
 */
type TitleBarMode = "native" | "custom";
const TITLE_BAR_MODE: TitleBarMode = "native";

export function TitleBar() {
  if (TITLE_BAR_MODE === "native") return null;
  return (
    <div
      data-tauri-drag-region
      className="h-4 w-full bg-surface-panel border-b border-subtle flex items-center px-2"
      style={{ userSelect: "none" }}
    />
  );
}
TitleBar.displayName = "TitleBar";
