/**
 * Phase 04 — initial avatar bubble.
 *
 * bg = hsl(hash(name), 55%, 45%) unless special="ai", which uses --ai purple
 * with a small Sparkles overlay.
 */

import { clsx } from "clsx";
import { Sparkles } from "@/lib/icons";

interface Props {
  name: string;
  special?: "ai";
  size?: number;
  className?: string;
}

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function InitialAvatar({ name, special, size = 24, className }: Props) {
  const isAi = special === "ai";
  const label = isAi ? "AI Assistant" : name;
  const text = isAi ? "AI" : initials(name);

  const style = isAi
    ? { width: size, height: size, background: "var(--ai)" }
    : {
        width: size,
        height: size,
        background: `hsl(${hashHue(name)}, 55%, 45%)`,
      };

  return (
    <span
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex items-center justify-center rounded-full shrink-0 relative overflow-hidden select-none",
        className,
      )}
      style={style}
    >
      <span
        className="text-white font-semibold leading-none"
        style={{ fontSize: Math.max(8, Math.round(size * 0.38)) }}
      >
        {text}
      </span>
      {isAi && (
        <span className="absolute bottom-0 right-0 bg-ai rounded-full p-px">
          <Sparkles size={Math.max(6, Math.round(size * 0.3))} className="text-white" />
        </span>
      )}
    </span>
  );
}
