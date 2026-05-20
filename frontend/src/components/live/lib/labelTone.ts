/**
 * Phase 04 — label → tone resolution.
 *
 * Curated registry from the redesign screenshots + deterministic fallback hash
 * so the same label always yields the same tone across renders and sessions.
 *
 * Locked in 00b-live-testing-visual-design-language.md.
 */

export type ToneKey =
  | "warn"
  | "info"
  | "ai"
  | "err"
  | "accent"
  | "ok"
  | "neutral";

/** Tailwind classes for each tone (fg + bg at 12% alpha). */
export interface LabelToneDescriptor {
  tone: ToneKey;
  fg: string;
  bg: string;
}

const TONE_STYLES: Record<ToneKey, LabelToneDescriptor> = {
  warn: { tone: "warn", fg: "text-warn", bg: "bg-warn/[0.12]" },
  info: { tone: "info", fg: "text-info", bg: "bg-info/[0.12]" },
  ai: { tone: "ai", fg: "text-ai", bg: "bg-ai/[0.12]" },
  err: { tone: "err", fg: "text-err", bg: "bg-err/[0.12]" },
  accent: { tone: "accent", fg: "text-accent-text", bg: "bg-accent/[0.12]" },
  ok: { tone: "ok", fg: "text-ok", bg: "bg-ok/[0.12]" },
  neutral: { tone: "neutral", fg: "text-ink-muted", bg: "bg-surface-overlay" },
};

/** Curated registry — label name uppercased for lookup. */
const CURATED: Record<string, ToneKey> = {
  PAYROLL: "warn",
  GPS: "info",
  MOBILE: "info",
  "REGRESSION-CANDIDATE": "err",
  "EDGE-CASE": "ai",
  "OFFLINE-FIRST": "accent",
  ANDROID: "ok",
  IOS: "neutral",
};

const TONE_KEYS = Object.keys(TONE_STYLES) as ToneKey[];

/** Deterministic hash of a string → [0, TONE_KEYS.length). */
function hashToneIndex(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) >>> 0;
  }
  return h % TONE_KEYS.length;
}

/**
 * Returns the `LabelToneDescriptor` for `label`.
 * Checks the curated registry first (case-insensitive).
 * Falls back to a deterministic hash so the same label always returns
 * the same tone without manual registration.
 */
export function labelTone(label: string): LabelToneDescriptor {
  const upper = (label ?? "").trim().toUpperCase();
  const curated = CURATED[upper];
  if (curated) return TONE_STYLES[curated];
  // deterministic hash fallback — skip "neutral" (index 6) for unknown labels
  // so they still get a colourful tint rather than the muted neutral.
  const idx = hashToneIndex(upper) % (TONE_KEYS.length - 1); // exclude neutral
  return TONE_STYLES[TONE_KEYS[idx]];
}
