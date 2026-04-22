import { useEffect, useRef } from "react";

/**
 * Shared keyboard-shortcut primitive. Centralises listener management
 * and the "ignore keystrokes while typing in input/textarea" rule that
 * otherwise has to be duplicated in every component.
 *
 * Supports:
 *   - single-key: "Escape", ","
 *   - modifier combos: "Ctrl+K", "Meta+K" (Mac), "Ctrl+Shift+N"
 *   - two-key leader sequences: "G R", "G L" (within 1500ms)
 *
 * Cross-platform: "Mod+K" matches Ctrl on Windows/Linux and Meta on Mac.
 */

type Handler = (e: KeyboardEvent) => void;

interface Options {
  enabled?: boolean;
  /** If true, the shortcut fires even when an input/textarea is focused. */
  allowInInputs?: boolean;
  /** If true, `e.preventDefault()` is called before the handler runs. */
  preventDefault?: boolean;
}

const LEADER_TIMEOUT_MS = 1500;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

function matchCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+").map((p) => p.trim().toLowerCase());
  const key = parts.pop()!;
  const needsCtrl = parts.includes("ctrl");
  const needsMeta = parts.includes("meta");
  const needsMod = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");

  if (e.key.toLowerCase() !== key && e.code.toLowerCase() !== key) return false;

  if (needsMod) {
    const macLike = navigator.platform.toLowerCase().includes("mac");
    if (macLike ? !e.metaKey : !e.ctrlKey) return false;
  } else {
    if (needsCtrl && !e.ctrlKey) return false;
    if (needsMeta && !e.metaKey) return false;
  }
  if (needsShift !== e.shiftKey) return false;
  if (needsAlt !== e.altKey) return false;
  return true;
}

export function useKeyboardShortcut(
  combo: string,
  handler: Handler,
  opts: Options = {},
): void {
  const { enabled = true, allowInInputs = false, preventDefault = true } = opts;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const isLeader = combo.includes(" ") && !combo.includes("+");
    const [leader, follower] = isLeader ? combo.split(" ") : ["", ""];
    let leaderArmedAt = 0;

    const onKey = (e: KeyboardEvent) => {
      if (!allowInInputs && isTyping(e.target)) return;

      if (isLeader) {
        if (!leaderArmedAt) {
          if (e.key.toLowerCase() === leader.toLowerCase()) {
            leaderArmedAt = Date.now();
          }
          return;
        }
        if (Date.now() - leaderArmedAt > LEADER_TIMEOUT_MS) {
          leaderArmedAt = 0;
          return;
        }
        if (e.key.toLowerCase() === follower.toLowerCase()) {
          leaderArmedAt = 0;
          if (preventDefault) e.preventDefault();
          handlerRef.current(e);
        }
        return;
      }

      if (matchCombo(e, combo)) {
        if (preventDefault) e.preventDefault();
        handlerRef.current(e);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, enabled, allowInInputs, preventDefault]);
}
