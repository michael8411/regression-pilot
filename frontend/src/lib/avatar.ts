/** Derive a stable hue (0–360) from any string, e.g. a user email. */
export function hueFrom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

/** Extract initials from a display name. "Alex Rivera" → "AR". */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}
