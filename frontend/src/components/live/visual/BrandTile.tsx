/**
 * Phase 04 — project brand tile.
 *
 * Renders a rounded square filled with a CSS linear-gradient from
 * `brandTile(projectKey)` with the abbreviated key in white over the gradient.
 * No per-card gradient code should exist in `BoardCard`.
 */

import { brandTile } from "@/components/live/lib/brandTiles";

interface Props {
  projectKey: string | null | undefined;
  size?: number;
  className?: string;
}

export function BrandTile({ projectKey, size = 36, className }: Props) {
  const key = (projectKey ?? "").trim().toUpperCase() || "?";
  const { gradient } = brandTile(key);

  const fontSize = Math.max(9, Math.round(size * 0.3));

  return (
    <span
      aria-label={`${key} project`}
      title={`${key} project`}
      className={`inline-flex items-center justify-center shrink-0 rounded-lg select-none ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: gradient,
        borderRadius: "var(--radius-lg, 10px)",
      }}
    >
      <span
        className="text-white font-bold tracking-wide"
        style={{ fontSize }}
      >
        {key.length > 4 ? key.slice(0, 3) : key}
      </span>
    </span>
  );
}
