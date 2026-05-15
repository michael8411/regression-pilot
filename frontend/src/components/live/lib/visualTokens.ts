/**
 * Phase 04 — shared visual constants for Live Testing surfaces.
 *
 * Phases 05 and 06 import from this file. No raw numbers elsewhere.
 * Locked in 00b-live-testing-visual-design-language.md.
 */

export type LiveBoardDensityKey = "compact" | "cozy" | "roomy";

export interface DensityTokens {
  /** Tailwind padding class applied to cards and panels. */
  padding: string;
  /** Tailwind gap class applied inside flex/grid layouts. */
  gap: string;
  /** Max lines for summary text clamp. */
  summaryClamp: number;
}

export const DENSITY_TOKENS: Record<LiveBoardDensityKey, DensityTokens> = {
  compact: { padding: "p-2", gap: "gap-1.5", summaryClamp: 1 },
  cozy: { padding: "p-3", gap: "gap-2", summaryClamp: 2 },
  roomy: { padding: "p-4", gap: "gap-3", summaryClamp: 3 },
};

/** Height of the card top-accent strip in pixels (raw number for inline style). */
export const CARD_TOP_ACCENT_HEIGHT_PX = 2;

/** Drawer width CSS value (used in drawer container style). */
export const DRAWER_WIDTH = "min(640px, 50vw)";

/** Underline thickness for `DrawerTabs` (used in tab active style). */
export const TAB_UNDERLINE_THICKNESS_PX = 2;
