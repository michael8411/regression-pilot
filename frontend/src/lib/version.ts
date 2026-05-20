/**
 * Single source of truth for the displayed app version.
 * Consumed by Settings → About pane.
 */

export const APP_VERSION = "0.2.0";

export function getBuildHash(): string {
  const fromEnv = (import.meta.env as Record<string, string | undefined>)
    .VITE_BUILD_HASH;
  return fromEnv && fromEnv.length > 0 ? fromEnv : "dev";
}
