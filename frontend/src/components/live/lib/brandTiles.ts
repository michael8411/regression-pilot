/**
 * Phase 04 — project key → gradient descriptor.
 *
 * `brandTile(projectKey)` returns a CSS linear-gradient stop pair so
 * `<BrandTile>` can render a recognisable project swatch without any
 * per-card inline gradient code in `BoardCard`.
 *
 * Locked in 00b-live-testing-visual-design-language.md.
 */

export interface BrandTileDescriptor {
  /** Gradient start color (hex). */
  from: string;
  /** Gradient end color (hex). */
  to: string;
  /** Prebuilt `background` CSS value. */
  gradient: string;
}

/** Curated gradient registry for known HCSS project keys. */
const CURATED: Record<string, [string, string]> = {
  FM: ["#0FB8A3", "#14D1B9"],  // Fleet Mobile — teal
  HQ: ["#3B82F6", "#60A5FA"],  // HeavyJob    — blue
  TEL: ["#8B5CF6", "#A78BFA"], // Telematics  — purple
  EQ: ["#F59E0B", "#FBBF24"],  // Equipment360 — amber
  CRW: ["#EC4899", "#F472B6"], // Crew Scheduler — pink
};

const CURATED_VALUES = Object.values(CURATED);

/** Deterministic index into CURATED_VALUES for unknown keys. */
function hashGradientIndex(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % CURATED_VALUES.length;
}

function toDescriptor(from: string, to: string): BrandTileDescriptor {
  return {
    from,
    to,
    gradient: `linear-gradient(135deg, ${from}, ${to})`,
  };
}

/**
 * Returns a gradient descriptor for `projectKey`.
 * Curated keys are matched case-insensitively.
 * Unknown keys deterministically resolve to one of the curated gradients.
 */
export function brandTile(projectKey: string | null | undefined): BrandTileDescriptor {
  const key = (projectKey ?? "").trim().toUpperCase();
  const curated = CURATED[key];
  if (curated) return toDescriptor(...curated);

  // Deterministic fallback — same key always maps to the same gradient.
  const [from, to] = CURATED_VALUES[hashGradientIndex(key)];
  return toDescriptor(from, to);
}
